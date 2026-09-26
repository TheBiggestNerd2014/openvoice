#include "dsp.h"

#include <algorithm>
#include <cmath>
#include <cstring>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

int Key::snapPitchClass(int pc) const {
  pc = ((pc % 12) + 12) % 12;
  int best = scale[0];
  int bestDist = 99;
  for (int i = 0; i < 7; ++i) {
    const int s = scale[i];
    const int d = std::min((pc - s + 12) % 12, (s - pc + 12) % 12);
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }
  return best;
}

void Key::triadIntervals(int rootPc, int* thirdSemis, int* fifthSemis) const {
  rootPc = ((rootPc % 12) + 12) % 12;
  // C major qualities: I/IV/V major, ii/iii/vi minor, vii dim.
  // Intervals are from the root, not I/IV/V progression picks.
  switch (rootPc) {
    case 0:  *thirdSemis = 4; *fifthSemis = 7; break; // C
    case 2:  *thirdSemis = 3; *fifthSemis = 7; break; // D
    case 4:  *thirdSemis = 3; *fifthSemis = 7; break; // E
    case 5:  *thirdSemis = 4; *fifthSemis = 7; break; // F
    case 7:  *thirdSemis = 4; *fifthSemis = 7; break; // G
    case 9:  *thirdSemis = 3; *fifthSemis = 7; break; // A
    case 11: *thirdSemis = 3; *fifthSemis = 6; break; // B
    default:
      *thirdSemis = 4;
      *fifthSemis = 7;
      break;
  }
  (void)tonicPc;
}

void PitchShifter::setup(int sampleRate) {
  sampleRate_ = sampleRate;
  delay_.assign(kLen, 0.f);
  reset();
}

void PitchShifter::setSemitones(float semitones) {
  // Negative semitones -> ratio < 1 -> read head moves slower -> lower pitch.
  ratio_ = std::pow(2.f, std::clamp(semitones, -24.f, 24.f) / 12.f);
}

void PitchShifter::reset() {
  std::fill(delay_.begin(), delay_.end(), 0.f);
  writePos_ = 0;
  behindA_ = static_cast<float>(kGrain) * 0.5f;
  behindB_ = 0.f;
}

float PitchShifter::process(float x) {
  const int n = static_cast<int>(delay_.size());
  delay_[writePos_] = x;

  if (std::fabs(ratio_ - 1.f) < 0.0015f) {
    writePos_ = (writePos_ + 1) % n;
    behindA_ = static_cast<float>(kGrain) * 0.5f;
    behindB_ = 0.f;
    return x;
  }

  auto tap = [&](float behind) {
    float b = behind;
    const float grain = static_cast<float>(kGrain);
    while (b < 0.f) {
      b += grain;
    }
    while (b >= grain) {
      b -= grain;
    }
    float pos = static_cast<float>(writePos_) - b;
    while (pos < 0.f) {
      pos += static_cast<float>(n);
    }
    const int i0 = static_cast<int>(pos) % n;
    const int i1 = (i0 + 1) % n;
    const float frac = pos - std::floor(pos);
    const float sample = delay_[i0] + (delay_[i1] - delay_[i0]) * frac;
    const float phase = b / grain;
    const float window = 0.5f * (1.f - std::cos(2.f * static_cast<float>(M_PI) * phase));
    return sample * window;
  };

  // Read heads advance at `ratio`. Negative semitones slow them and lower the pitch.
  // Grains stay half a window apart and reset at the window edge, so loudness does not sweep.
  const float out = tap(behindA_) + tap(behindB_);
  const float drift = 1.f - ratio_;
  behindA_ += drift;
  behindB_ += drift;
  const float grain = static_cast<float>(kGrain);
  while (behindA_ < 0.f) behindA_ += grain;
  while (behindA_ >= grain) behindA_ -= grain;
  while (behindB_ < 0.f) behindB_ += grain;
  while (behindB_ >= grain) behindB_ -= grain;

  writePos_ = (writePos_ + 1) % n;
  return out;
}

void OnePoleHighpass::setup(int sampleRate, float hz) {
  const float x = std::exp(-2.f * static_cast<float>(M_PI) * hz / static_cast<float>(sampleRate));
  a_ = x;
  prevX_ = 0;
  prevY_ = 0;
}

float OnePoleHighpass::process(float x) {
  const float y = a_ * (prevY_ + x - prevX_);
  prevX_ = x;
  prevY_ = y;
  return y;
}

void AutoChords::setup(int sampleRate) {
  sampleRate_ = sampleRate;
  hop_ = 512;
  yinSize_ = 1024;
  yinBuf_.assign(yinSize_, 0.f);
  yinDiff_.assign(yinSize_ / 2, 0.f);
  yinCmnd_.assign(yinSize_ / 2, 1.f);
  for (auto& voice : voices_) {
    voice.setup(sampleRate);
  }
  reset();
}

void AutoChords::setKey(const Key& key) {
  key_ = key;
}

void AutoChords::setHoldMs(float ms) {
  holdMs_ = std::clamp(ms, 20.f, 400.f);
}

void AutoChords::setHarmonyGain(float gain) {
  harmonyGain_ = std::clamp(gain, 0.f, 2.f);
}

void AutoChords::setOscType(OscType type) {
  (void)type;
}

void AutoChords::reset() {
  std::fill(yinBuf_.begin(), yinBuf_.end(), 0.f);
  yinFill_ = 0;
  proposedMidi_ = -1;
  proposedStableHops_ = 0;
  activeRoot_ = -1;
  thirdSemis_ = 4;
  fifthSemis_ = 7;
  haveMidi_ = false;
  hangSamples_ = 0;
  histPos_ = 0;
  histCount_ = 0;
  anchorMidi_ = 60.f;
  unvoicedHops_ = 0;
  env_ = 0;
  voiced_ = false;
  for (int i = 0; i < 3; ++i) {
    currentSemis_[i] = targetSemis_[i];
    voices_[i].reset();
  }
}

bool AutoChords::detectPitch(float* f0, float* confidence) {
  const int n = yinSize_;
  const int minTau = std::max(2, sampleRate_ / 800);
  const int maxTau = std::min(n / 2, sampleRate_ / 60);
  const float threshold = 0.15f;

  float* diff = yinDiff_.data();
  float* cmnd = yinCmnd_.data();
  for (int tau = 1; tau < maxTau; ++tau) {
    float sum = 0;
    const int step = 2;
    for (int j = 0; j + tau < n; j += step) {
      const float d = yinBuf_[j] - yinBuf_[j + tau];
      sum += d * d;
    }
    diff[tau] = sum * static_cast<float>(step);
  }

  float running = 0;
  cmnd[0] = 1;
  for (int tau = 1; tau < maxTau; ++tau) {
    running += diff[tau];
    cmnd[tau] = running > 0.f ? (diff[tau] * tau / running) : 1.f;
  }

  int tauEst = -1;
  for (int tau = minTau; tau < maxTau; ++tau) {
    if (cmnd[tau] < threshold) {
      while (tau + 1 < maxTau && cmnd[tau + 1] < cmnd[tau]) {
        ++tau;
      }
      tauEst = tau;
      break;
    }
  }

  if (tauEst < 0) {
    float best = 1.f;
    for (int tau = minTau; tau < maxTau; ++tau) {
      if (cmnd[tau] < best) {
        best = cmnd[tau];
        tauEst = tau;
      }
    }
    if (best > 0.35f) {
      *confidence = 0;
      *f0 = 0;
      return false;
    }
  }

  float tau = static_cast<float>(tauEst);
  if (tauEst > 1 && tauEst + 1 < maxTau) {
    const float s0 = cmnd[tauEst - 1];
    const float s1 = cmnd[tauEst];
    const float s2 = cmnd[tauEst + 1];
    const float denom = 2.f * (s0 - 2.f * s1 + s2);
    if (std::fabs(denom) > 1e-9f) {
      tau += (s0 - s2) / denom;
    }
  }

  *f0 = static_cast<float>(sampleRate_) / tau;
  *confidence = std::clamp(1.f - cmnd[tauEst], 0.f, 1.f);
  if (*f0 < 60.f || *f0 > 900.f || *confidence < 0.45f) {
    return false;
  }
  return true;
}

int AutoChords::quantizeFromMidi(float midi) const {
  const int baseOct = static_cast<int>(std::floor(midi / 12.f));
  float best = midi;
  float bestDist = 100.f;
  for (int oct = baseOct - 1; oct <= baseOct + 1; ++oct) {
    for (int i = 0; i < 7; ++i) {
      const float cand = static_cast<float>(key_.scale[i] + oct * 12);
      const float dist = std::fabs(cand - midi);
      if (dist < bestDist) {
        bestDist = dist;
        best = cand;
      }
    }
  }
  return static_cast<int>(std::lround(best));
}

int AutoChords::pickRandomRoot(float midi) {
  rngState_ = rngState_ * 1664525u + 1013904223u;
  if (rngState_ == 0) {
    rngState_ = 1;
  }
  const int pc = key_.scale[static_cast<int>(rngState_ % 7u)];
  const int baseOct = static_cast<int>(std::floor(midi / 12.f));
  int best = pc + baseOct * 12;
  float bestDist = 100.f;
  for (int oct = baseOct - 1; oct <= baseOct + 1; ++oct) {
    const int cand = pc + oct * 12;
    const float dist = std::fabs(static_cast<float>(cand) - midi);
    if (dist < bestDist) {
      bestDist = dist;
      best = cand;
    }
  }
  return std::clamp(best, 36, 84);
}

void AutoChords::retarget() {
  if (!haveMidi_ || activeRoot_ < 0) {
    return;
  }
  targetSemis_[0] = static_cast<float>(activeRoot_) - smoothedMidi_;
  targetSemis_[1] = static_cast<float>(activeRoot_ + thirdSemis_) - smoothedMidi_;
  targetSemis_[2] = static_cast<float>(activeRoot_ + fifthSemis_) - smoothedMidi_;
}

void AutoChords::commitRoot(int midi) {
  activeRoot_ = midi;
  key_.triadIntervals(midi, &thirdSemis_, &fifthSemis_);
  retarget();
}

void AutoChords::analyzeIfReady() {
  if (yinFill_ < yinSize_) {
    return;
  }

  float f0 = 0;
  float conf = 0;
  const bool ok = detectPitch(&f0, &conf);

  float rms = 0;
  for (float s : yinBuf_) {
    rms += s * s;
  }
  rms = std::sqrt(rms / static_cast<float>(yinSize_));
  const bool voiced = ok && rms > 0.008f && conf >= 0.5f;
  voiced_ = voiced;

  if (voiced) {
    const float midiF = 69.f + 12.f * std::log2(f0 / 440.f);
    midiHist_[histPos_] = midiF;
    histPos_ = (histPos_ + 1) % 5;
    if (histCount_ < 5) {
      ++histCount_;
    }
    float sorted[5];
    for (int i = 0; i < histCount_; ++i) {
      sorted[i] = midiHist_[i];
    }
    std::sort(sorted, sorted + histCount_);
    smoothedMidi_ = sorted[histCount_ / 2];
    haveMidi_ = true;

    unvoicedHops_ = 0;
    // A small wobble must not retune the chord. A real rise or fall steps
    // to the next legitimate triad in that direction.
    constexpr float kDeadzone = 2.f;
    if (activeRoot_ < 0) {
      commitRoot(pickRandomRoot(smoothedMidi_));
      anchorMidi_ = smoothedMidi_;
      proposedMidi_ = activeRoot_;
      proposedStableHops_ = 0;
    } else {
      const float delta = smoothedMidi_ - anchorMidi_;
      if (std::fabs(delta) >= kDeadzone) {
        const int snapped = quantizeFromMidi(static_cast<float>(activeRoot_) + delta);
        const bool sameWay = (delta > 0.f && snapped > activeRoot_) || (delta < 0.f && snapped < activeRoot_);
        if (sameWay) {
          if (snapped == proposedMidi_) {
            ++proposedStableHops_;
          } else {
            proposedMidi_ = snapped;
            proposedStableHops_ = 1;
          }
          const float hopSec = static_cast<float>(hop_) / static_cast<float>(sampleRate_);
          const int need = std::max(1, static_cast<int>(std::ceil((holdMs_ / 1000.f) / hopSec)));
          if (proposedStableHops_ >= need) {
            commitRoot(snapped);
            anchorMidi_ = smoothedMidi_;
          }
        }
      } else {
        proposedMidi_ = activeRoot_;
        proposedStableHops_ = 0;
      }
      retarget();
    }
  } else {
    ++unvoicedHops_;
    const int reRoll = std::max(1, sampleRate_ / std::max(hop_, 1) / 4);
    if (unvoicedHops_ > reRoll) {
      activeRoot_ = -1;
      proposedMidi_ = -1;
      proposedStableHops_ = 0;
    }
  }

  const int keep = yinSize_ - hop_;
  if (keep > 0) {
    std::memmove(yinBuf_.data(), yinBuf_.data() + hop_, static_cast<size_t>(keep) * sizeof(float));
  }
  yinFill_ = keep;
}

float AutoChords::process(float voiceSample) {
  if (yinFill_ < yinSize_) {
    yinBuf_[yinFill_++] = voiceSample;
  }
  analyzeIfReady();

  const bool sounding = voiced_ || std::fabs(voiceSample) > 0.008f;
  if (sounding && activeRoot_ >= 0) {
    hangSamples_ = sampleRate_;
  } else if (hangSamples_ > 0) {
    --hangSamples_;
  }

  const float envTarget = (activeRoot_ >= 0 && hangSamples_ > 0) ? 1.f : 0.f;
  const float envCoeff = envTarget > env_ ? 0.004f : 0.00012f;
  env_ += (envTarget - env_) * envCoeff;

  const float glide = 1.f - std::exp(-1.f / (0.02f * static_cast<float>(sampleRate_)));
  float chord = 0.f;
  const float partGain[3] = {1.f, 0.82f, 0.74f};
  for (int i = 0; i < 3; ++i) {
    currentSemis_[i] += (targetSemis_[i] - currentSemis_[i]) * glide;
    voices_[i].setSemitones(currentSemis_[i]);
    chord += voices_[i].process(voiceSample) * partGain[i];
  }
  return chord * (0.42f * harmonyGain_ * env_);
}

void VoiceProcessor::setup(int sampleRate) {
  sampleRate_ = sampleRate;
  shifter_.setup(sampleRate);
  squeakHp_.setup(sampleRate, 180.f);
  chords_.setup(sampleRate);
  chords_.setKey(Key{});
  reset();
}

void VoiceProcessor::setMode(VoiceMode mode) {
  mode_ = mode;
}

void VoiceProcessor::setPitchSemitones(float semis) {
  pitchSemis_ = semis;
  if (mode_ == VoiceMode::Pitch) {
    shifter_.setSemitones(semis);
  }
}

void VoiceProcessor::setHarmonyGain(float gain) {
  chords_.setHarmonyGain(gain);
}

void VoiceProcessor::setChordHoldMs(float ms) {
  chords_.setHoldMs(ms);
}

void VoiceProcessor::setOscType(OscType type) {
  chords_.setOscType(type);
}

void VoiceProcessor::reset() {
  shifter_.reset();
  chords_.reset();
  robotPhase_ = 0;
  robotHold_ = 0;
  robotHoldCount_ = 0;
}

float VoiceProcessor::process(float x) {
  switch (mode_) {
    case VoiceMode::Pitch: {
      shifter_.setSemitones(pitchSemis_);
      return shifter_.process(x);
    }
    case VoiceMode::Squeaky: {
      shifter_.setSemitones(squeakSemis_);
      return squeakHp_.process(shifter_.process(x));
    }
    case VoiceMode::Robot: {
      robotPhase_ += 48.f / static_cast<float>(sampleRate_);
      if (robotPhase_ >= 1.f) {
        robotPhase_ -= 1.f;
      }
      const float sine = std::sin(2.f * static_cast<float>(M_PI) * robotPhase_);
      const float square = std::tanh(sine * 8.f);
      const float ring = x * square;
      if (++robotHoldCount_ >= 11) {
        robotHold_ = x;
        robotHoldCount_ = 0;
      }
      const float y = 0.2f * x + 0.9f * ring + 0.35f * robotHold_ * square;
      return std::tanh(1.25f * y);
    }
    case VoiceMode::Chords:
      return chords_.process(x);
    default:
      return x;
  }
}
