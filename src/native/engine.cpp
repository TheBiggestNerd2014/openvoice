#include "engine.h"

#include "miniaudio.h"

#include <algorithm>
#include <cctype>
#include <cmath>
#include <cstring>

namespace {

std::string toLower(std::string s) {
  std::transform(s.begin(), s.end(), s.begin(), [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
  return s;
}

std::string idToHex(const ma_device_id& id) {
  const auto* p = reinterpret_cast<const unsigned char*>(&id);
  static const char* hex = "0123456789abcdef";
  std::string out(sizeof(ma_device_id) * 2, '0');
  for (size_t i = 0; i < sizeof(ma_device_id); ++i) {
    out[i * 2] = hex[(p[i] >> 4) & 0xf];
    out[i * 2 + 1] = hex[p[i] & 0xf];
  }
  return out;
}

bool hexToId(const std::string& hex, ma_device_id* id) {
  if (hex.size() != sizeof(ma_device_id) * 2) {
    return false;
  }
  auto* p = reinterpret_cast<unsigned char*>(id);
  auto nibble = [](char c) -> int {
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    return -1;
  };
  for (size_t i = 0; i < sizeof(ma_device_id); ++i) {
    const int hi = nibble(hex[i * 2]);
    const int lo = nibble(hex[i * 2 + 1]);
    if (hi < 0 || lo < 0) {
      return false;
    }
    p[i] = static_cast<unsigned char>((hi << 4) | lo);
  }
  return true;
}

bool looksLikeCableInput(const std::string& name) {
  const std::string n = toLower(name);
  return n.find("cable input") != std::string::npos;
}

bool looksLikeCableOutput(const std::string& name) {
  const std::string n = toLower(name);
  return n.find("cable output") != std::string::npos;
}

bool looksLikeLoopback(const std::string& name) {
  const std::string n = toLower(name);
  return n.find("loopback") != std::string::npos || n.find("stereo mix") != std::string::npos;
}

bool isSafeCapture(const std::string& name) {
  return !looksLikeCableOutput(name) && !looksLikeLoopback(name);
}

bool isSafeMonitor(const std::string& name) {
  return !looksLikeCableInput(name);
}

float mixMono(const float* frame, unsigned channels) {
  if (channels <= 1) {
    return frame[0];
  }
  float s = 0;
  for (unsigned i = 0; i < channels; ++i) {
    s += frame[i];
  }
  return s / static_cast<float>(channels);
}

void captureThunk(ma_device* device, void* output, const void* input, ma_uint32 frameCount) {
  (void)output;
  auto* engine = static_cast<Engine*>(device->pUserData);
  engine->onCapture(static_cast<const float*>(input), frameCount, device->capture.channels);
}

} // namespace

// Playback devices store a small userdata wrapper.
struct PlaybackUser {
  Engine* engine;
  bool monitor;
};

static void playbackCallback(ma_device* device, void* output, const void* input, ma_uint32 frameCount) {
  (void)input;
  auto* user = static_cast<PlaybackUser*>(device->pUserData);
  auto* out = static_cast<float*>(output);
  const unsigned ch = device->playback.channels;
  for (ma_uint32 i = 0; i < frameCount; ++i) {
    const float s = user->engine->pullPlayback(user->monitor);
    for (unsigned c = 0; c < ch; ++c) {
      out[i * ch + c] = s;
    }
  }
}

Engine& Engine::instance() {
  static Engine engine;
  return engine;
}

DeviceLists Engine::listDevices() const {
  DeviceLists lists;
  ma_context context;
  if (ma_context_init(nullptr, 0, nullptr, &context) != MA_SUCCESS) {
    return lists;
  }

  ma_device_info* captures = nullptr;
  ma_uint32 captureCount = 0;
  ma_device_info* playacks = nullptr;
  ma_uint32 playbackCount = 0;
  if (ma_context_get_devices(&context, &playacks, &playbackCount, &captures, &captureCount) != MA_SUCCESS) {
    ma_context_uninit(&context);
    return lists;
  }

  for (ma_uint32 i = 0; i < captureCount; ++i) {
    AudioDeviceInfo d;
    d.id = idToHex(captures[i].id);
    d.name = captures[i].name;
    d.isDefault = captures[i].isDefault != 0;
    lists.inputs.push_back(std::move(d));
  }
  for (ma_uint32 i = 0; i < playbackCount; ++i) {
    AudioDeviceInfo d;
    d.id = idToHex(playacks[i].id);
    d.name = playacks[i].name;
    d.isDefault = playacks[i].isDefault != 0;
    lists.outputs.push_back(std::move(d));
  }

  ma_context_uninit(&context);
  return lists;
}

bool Engine::findCableOutputId(std::string* id, std::string* name) const {
  const auto lists = listDevices();
  for (const auto& d : lists.outputs) {
    if (looksLikeCableInput(d.name)) {
      if (id) *id = d.id;
      if (name) *name = d.name;
      return true;
    }
  }
  return false;
}

bool Engine::cablePresent() const {
  if (cableUp_.load()) {
    return true;
  }
  return findCableOutputId(nullptr, nullptr);
}

bool Engine::running() const {
  return running_.load();
}

bool Engine::voiceEnabled() const {
  return voiceOn_.load();
}

bool Engine::monitorEnabled() const {
  return monitorOn_.load();
}

bool Engine::startPlayback(void** slot, const std::string& idHex, bool monitor, std::string* error) {
  auto* device = new ma_device();
  auto* user = new PlaybackUser{this, monitor};

  ma_device_config config = ma_device_config_init(ma_device_type_playback);
  config.playback.format = ma_format_f32;
  config.playback.channels = 2;
  config.sampleRate = kSampleRate;
  config.periodSizeInFrames = 256;
  config.dataCallback = playbackCallback;
  config.pUserData = user;
  config.performanceProfile = ma_performance_profile_low_latency;

  ma_device_id id{};
  if (!idHex.empty() && hexToId(idHex, &id)) {
    config.playback.pDeviceID = &id;
  }

  if (ma_device_init(static_cast<ma_context*>(context_), &config, device) != MA_SUCCESS) {
    delete user;
    delete device;
    if (error) {
      *error = monitor ? "Failed to open monitor device" : "Failed to open CABLE Input / playback device";
    }
    return false;
  }
  if (ma_device_start(device) != MA_SUCCESS) {
    ma_device_uninit(device);
    delete user;
    delete device;
    if (error) {
      *error = monitor ? "Failed to start monitor device" : "Failed to start playback device";
    }
    return false;
  }

  *slot = device;
  return true;
}

bool Engine::start(const std::string& inputId, const std::string& cableId, const std::string& monitorId, std::string* error) {
  stop();

  const DeviceLists lists = listDevices();

  std::string resolvedInput = inputId;
  auto inputOk = [&](const std::string& id) {
    for (const auto& d : lists.inputs) {
      if (d.id == id) {
        return isSafeCapture(d.name);
      }
    }
    return false;
  };
  if (!inputOk(resolvedInput)) {
    resolvedInput.clear();
    for (const auto& d : lists.inputs) {
      if (d.isDefault && isSafeCapture(d.name)) {
        resolvedInput = d.id;
        break;
      }
    }
    if (resolvedInput.empty()) {
      for (const auto& d : lists.inputs) {
        if (isSafeCapture(d.name)) {
          resolvedInput = d.id;
          break;
        }
      }
    }
  }

  std::string resolvedCable = cableId;
  if (resolvedCable.empty()) {
    findCableOutputId(&resolvedCable, nullptr);
  }

  std::string resolvedMonitor = monitorId;
  auto monitorOk = [&](const std::string& id) {
    if (id.empty() || id == resolvedCable) {
      return false;
    }
    for (const auto& d : lists.outputs) {
      if (d.id == id) {
        return isSafeMonitor(d.name);
      }
    }
    return false;
  };
  if (!monitorOk(resolvedMonitor)) {
    resolvedMonitor.clear();
    for (const auto& d : lists.outputs) {
      if (d.isDefault && isSafeMonitor(d.name) && d.id != resolvedCable) {
        resolvedMonitor = d.id;
        break;
      }
    }
    if (resolvedMonitor.empty()) {
      for (const auto& d : lists.outputs) {
        if (isSafeMonitor(d.name) && d.id != resolvedCable) {
          resolvedMonitor = d.id;
          break;
        }
      }
    }
  }

  auto* context = new ma_context();
  if (ma_context_init(nullptr, 0, nullptr, context) != MA_SUCCESS) {
    delete context;
    if (error) *error = "Failed to init audio context";
    return false;
  }
  context_ = context;

  cableRing_.setup(8192);
  monitorRing_.setup(8192);
  voice_.setup(kSampleRate);
  outHist_.assign(static_cast<size_t>(kSampleRate) / 10, 0.f);
  micHist_.assign(static_cast<size_t>(kSampleRate) / 10, 0.f);
  outWrite_ = 0;
  bestLag_ = kSampleRate / 40;
  echoCorr_ = 0.f;
  echoPower_ = 0.f;
  micPower_ = 0.f;
  duck_ = 1.f;
  gateEnv_ = 0.f;
  hpX_ = 0.f;
  hpY_ = 0.f;

  auto* capture = new ma_device();
  ma_device_config cap = ma_device_config_init(ma_device_type_capture);
  cap.capture.format = ma_format_f32;
  cap.capture.channels = 1;
  cap.sampleRate = kSampleRate;
  cap.periodSizeInFrames = 256;
  cap.dataCallback = captureThunk;
  cap.pUserData = this;
  cap.performanceProfile = ma_performance_profile_low_latency;

  ma_device_id inId{};
  if (!resolvedInput.empty() && hexToId(resolvedInput, &inId)) {
    cap.capture.pDeviceID = &inId;
  }

  if (ma_device_init(context, &cap, capture) != MA_SUCCESS) {
    delete capture;
    ma_context_uninit(context);
    delete context;
    context_ = nullptr;
    if (error) *error = "Failed to open microphone";
    return false;
  }
  if (ma_device_start(capture) != MA_SUCCESS) {
    ma_device_uninit(capture);
    delete capture;
    ma_context_uninit(context);
    delete context;
    context_ = nullptr;
    if (error) *error = "Failed to start microphone";
    return false;
  }
  capture_ = capture;

  std::string playErr;
  if (!resolvedCable.empty() && startPlayback(&cable_, resolvedCable, false, &playErr)) {
    cableUp_.store(true);
  } else {
    cableUp_.store(false);
  }

  if (resolvedMonitor.empty() || !startPlayback(&monitorDev_, resolvedMonitor, true, &playErr)) {
    monitorDev_ = nullptr;
  }

  running_.store(true);
  return true;
}

void Engine::stop() {
  running_.store(false);
  cableUp_.store(false);

  if (capture_) {
    auto* device = static_cast<ma_device*>(capture_);
    ma_device_stop(device);
    ma_device_uninit(device);
    delete device;
    capture_ = nullptr;
  }
  if (cable_) {
    auto* device = static_cast<ma_device*>(cable_);
    auto* user = static_cast<PlaybackUser*>(device->pUserData);
    ma_device_stop(device);
    ma_device_uninit(device);
    delete device;
    delete user;
    cable_ = nullptr;
  }
  if (monitorDev_) {
    auto* device = static_cast<ma_device*>(monitorDev_);
    auto* user = static_cast<PlaybackUser*>(device->pUserData);
    ma_device_stop(device);
    ma_device_uninit(device);
    delete device;
    delete user;
    monitorDev_ = nullptr;
  }
  if (context_) {
    ma_context_uninit(static_cast<ma_context*>(context_));
    delete static_cast<ma_context*>(context_);
    context_ = nullptr;
  }
}

void Engine::setVoiceEnabled(bool on) {
  voiceOn_.store(on);
  if (!on) {
    monitorOn_.store(false);
  }
}

void Engine::setMonitorEnabled(bool on) {
  if (!voiceOn_.load()) {
    monitorOn_.store(false);
    return;
  }
  monitorOn_.store(on);
}

void Engine::setMode(int mode) {
  voice_.setMode(static_cast<VoiceMode>(mode));
}

void Engine::setPitchSemitones(float semis) {
  voice_.setPitchSemitones(semis);
}

void Engine::setInputGain(float g) {
  inputGain_.store(std::clamp(g, 0.f, 2.f));
}

void Engine::setOutputGain(float g) {
  outputGain_.store(std::clamp(g, 0.f, 2.f));
}

void Engine::setPadGain(float g) {
  padGain_.store(std::clamp(g, 0.f, 2.f));
}

void Engine::setHarmonyGain(float g) {
  voice_.setHarmonyGain(g);
}

void Engine::setChordHoldMs(float ms) {
  voice_.setChordHoldMs(ms);
}

void Engine::getMeters(float* input, float* output) const {
  if (input) *input = inMeter_.load();
  if (output) *output = outMeter_.load();
}

bool Engine::loadPad(int id, const std::string& path, std::string* error) {
  if (id < 0 || id >= kMaxPads) {
    if (error) *error = "Invalid pad id";
    return false;
  }

  ma_decoder_config cfg = ma_decoder_config_init(ma_format_f32, 1, kSampleRate);
  ma_decoder decoder;
  if (ma_decoder_init_file(path.c_str(), &cfg, &decoder) != MA_SUCCESS) {
    if (error) *error = "Could not decode audio file";
    return false;
  }

  ma_uint64 frameCount = 0;
  ma_decoder_get_length_in_pcm_frames(&decoder, &frameCount);
  if (frameCount == 0 || frameCount > static_cast<ma_uint64>(kSampleRate) * 60) {
    // Unknown length or > 60s: read incrementally.
    std::vector<float> pcm;
    float tmp[4096];
    for (;;) {
      ma_uint64 got = 0;
      ma_decoder_read_pcm_frames(&decoder, tmp, 4096, &got);
      if (got == 0) {
        break;
      }
      pcm.insert(pcm.end(), tmp, tmp + got);
      if (pcm.size() > static_cast<size_t>(kSampleRate) * 90) {
        break;
      }
    }
    ma_decoder_uninit(&decoder);
    if (pcm.empty()) {
      if (error) *error = "Empty audio file";
      return false;
    }
    std::lock_guard<std::mutex> lock(padMutex_);
    pads_[id].playPos.store(-1);
    pads_[id].pcm = std::move(pcm);
    pads_[id].frames.store(static_cast<int>(pads_[id].pcm.size()));
    return true;
  }

  std::vector<float> pcm(static_cast<size_t>(frameCount));
  ma_uint64 read = 0;
  ma_decoder_read_pcm_frames(&decoder, pcm.data(), frameCount, &read);
  ma_decoder_uninit(&decoder);
  pcm.resize(static_cast<size_t>(read));
  if (pcm.empty()) {
    if (error) *error = "Empty audio file";
    return false;
  }

  std::lock_guard<std::mutex> lock(padMutex_);
  pads_[id].playPos.store(-1);
  pads_[id].pcm = std::move(pcm);
  pads_[id].frames.store(static_cast<int>(pads_[id].pcm.size()));
  return true;
}

void Engine::unloadPad(int id) {
  if (id < 0 || id >= kMaxPads) {
    return;
  }
  std::lock_guard<std::mutex> lock(padMutex_);
  pads_[id].playPos.store(-1);
  pads_[id].frames.store(0);
  pads_[id].pcm.clear();
}

void Engine::playPad(int id) {
  if (id < 0 || id >= kMaxPads) {
    return;
  }
  if (pads_[id].frames.load() > 0) {
    pads_[id].playPos.store(0);
  }
}

void Engine::stopPad(int id) {
  if (id < 0 || id >= kMaxPads) {
    return;
  }
  pads_[id].playPos.store(-1);
}

float Engine::suppressFeedback(float mic) {
  const float hp = 0.982f * (hpY_ + mic - hpX_);
  hpX_ = mic;
  hpY_ = hp;
  mic = hp;
  if (!micHist_.empty()) {
    micHist_[static_cast<size_t>(outWrite_)] = mic;
  }

  const float absMic = std::fabs(mic);
  const float gateTarget = absMic > 0.04f ? 1.f : (absMic < 0.016f ? 0.f : gateEnv_);
  gateEnv_ += (gateTarget - gateEnv_) * (gateTarget > gateEnv_ ? 0.12f : 0.008f);

  if (!outHist_.empty()) {
    const int n = static_cast<int>(outHist_.size());
    int idx = outWrite_ - bestLag_;
    if (idx < 0) {
      idx += n;
    }
    const float delayed = outHist_[static_cast<size_t>(idx)];
    echoCorr_ = 0.992f * echoCorr_ + 0.008f * mic * delayed;
    echoPower_ = 0.992f * echoPower_ + 0.008f * delayed * delayed;
    micPower_ = 0.992f * micPower_ + 0.008f * mic * mic;

    if (echoPower_ > 1e-6f) {
      const float gain = std::clamp(echoCorr_ / echoPower_, -1.2f, 1.2f);
      mic -= gain * delayed;
    }

    float coherence = 0.f;
    const float denom = micPower_ * echoPower_;
    if (denom > 1e-8f) {
      coherence = std::fabs(echoCorr_) / std::sqrt(denom);
    }
    float duckTarget = 1.f;
    if (coherence > 0.82f && echoPower_ > 0.0008f) {
      duckTarget = 0.05f;
    } else if (coherence > 0.62f && echoPower_ > 0.0004f) {
      duckTarget = 0.28f;
    }
    const float coeff = duckTarget < duck_ ? 0.035f : 0.0015f;
    duck_ += (duckTarget - duck_) * coeff;
    mic *= duck_;
  }

  return mic * gateEnv_;
}

void Engine::rememberOutput(float sample) {
  if (outHist_.empty()) {
    return;
  }
  outHist_[static_cast<size_t>(outWrite_)] = sample;
  const int n = static_cast<int>(outHist_.size());
  outWrite_ = (outWrite_ + 1) % n;
}

void Engine::updateFeedbackLag() {
  const int n = static_cast<int>(outHist_.empty() ? 0 : outHist_.size());
  if (n < 64) {
    return;
  }
  static const int kLags[] = {960, 1200, 1440, 1920, 2400, 2880, 3600, 4320};
  float best = 0.f;
  int bestLag = bestLag_;
  for (int lag : kLags) {
    if (lag >= n || micHist_.size() != outHist_.size()) {
      continue;
    }
    float dot = 0.f;
    float micE = 0.f;
    float outE = 0.f;
    for (int i = 0; i < 64; ++i) {
      int a = outWrite_ - 1 - i;
      int b = a - lag;
      while (a < 0) a += n;
      while (b < 0) b += n;
      const float m = micHist_[static_cast<size_t>(a)];
      const float o = outHist_[static_cast<size_t>(b)];
      dot += m * o;
      micE += m * m;
      outE += o * o;
    }
    const float denom = micE * outE;
    const float score = denom > 1e-8f ? std::fabs(dot) / std::sqrt(denom) : 0.f;
    if (score > best) {
      best = score;
      bestLag = lag;
    }
  }
  if (best > 0.35f) {
    bestLag_ = bestLag;
  }
}

void Engine::onCapture(const float* input, unsigned frameCount, unsigned channels) {
  if (!input) {
    return;
  }

  float inPeak = 0;
  float outPeak = 0;
  const bool voiceOn = voiceOn_.load();
  const bool monitorOn = voiceOn && monitorOn_.load();
  const float inG = inputGain_.load();
  const float outG = outputGain_.load();
  const float padG = padGain_.load();

  for (unsigned i = 0; i < frameCount; ++i) {
    float mic = mixMono(input + i * channels, channels) * inG;
    inPeak = std::max(inPeak, std::fabs(mic));
    mic = suppressFeedback(mic);

    float voice = 0.f;
    if (voiceOn) {
      voice = voice_.process(mic);
    }

    float pads = 0.f;
    for (int p = 0; p < kMaxPads; ++p) {
      int pos = pads_[p].playPos.load(std::memory_order_relaxed);
      const int n = pads_[p].frames.load(std::memory_order_relaxed);
      if (pos < 0 || pos >= n) {
        continue;
      }
      pads += pads_[p].pcm[static_cast<size_t>(pos)] * pads_[p].volume.load(std::memory_order_relaxed);
      ++pos;
      pads_[p].playPos.store(pos >= n ? -1 : pos, std::memory_order_relaxed);
    }

    float mix = (voice + pads * padG) * outG;
    const float a = std::fabs(mix);
    if (a > 0.55f) {
      const float soft = 0.55f + (1.f - std::exp(-(a - 0.55f) * 3.f)) * 0.35f;
      mix = std::copysign(std::min(soft, 0.92f), mix);
    }
    outPeak = std::max(outPeak, std::fabs(mix));

    rememberOutput(mix);
    cableRing_.writeSample(mix);
    monitorRing_.writeSample(monitorOn ? mix : 0.f);
  }

  updateFeedbackLag();

  inMeter_.store(inPeak);
  outMeter_.store(outPeak);
}

float Engine::pullPlayback(bool monitor) {
  return monitor ? monitorRing_.readSample() : cableRing_.readSample();
}
