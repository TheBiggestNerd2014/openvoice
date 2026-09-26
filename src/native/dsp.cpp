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
  ratio_ = std::pow(2.f, std::clamp(semitones, -24.f, 24.f) / 12.f);
}

void PitchShifter::reset() {
  std::fill(delay_.begin(), delay_.end(), 0.f);
  writePos_ = 0;
  delayTime_ = static_cast<float>(kLen) * 0.25f;
}

float PitchShifter::process(float x) {
  const int n = static_cast<int>(delay_.size());
  delay_[writePos_] = x;
  writePos_ = (writePos_ + 1) % n;

  if (std::fabs(ratio_ - 1.f) < 0.0015f) {
    return x;
  }

  auto tap = [&](float delaySamps) {
    while (delaySamps < 1.f) {
      delaySamps += static_cast<float>(n);
    }
    while (delaySamps >= static_cast<float>(n)) {
      delaySamps -= static_cast<float>(n);
    }
    float pos = static_cast<float>(writePos_) - delaySamps;
    while (pos < 0.f) {
      pos += static_cast<float>(n);
    }
    const int i0 = static_cast<int>(pos) % n;
    const int i1 = (i0 + 1) % n;
    const float frac = pos - std::floor(pos);
    return delay_[i0] + (delay_[i1] - delay_[i0]) * frac;
  };

  float d0 = delayTime_;
  float d1 = delayTime_ + static_cast<float>(n) * 0.5f;
  if (d1 >= static_cast<float>(n)) {
    d1 -= static_cast<float>(n);
  }
  const float env = d0 / static_cast<float>(n);
  const float out = tap(d0) * (1.f - env) + tap(d1) * env;

  delayTime_ += 1.f - ratio_;
  if (delayTime_ >= static_cast<float>(n)) {
    delayTime_ -= static_cast<float>(n);
  } else if (delayTime_ < 0.f) {
    delayTime_ += static_cast<float>(n);
  }
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
  hop_ = 768;
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
  env_ = 0;
  voiced_ = false;
  harmState_ = 0;
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
  for (int tau = 1; tau < maxTau; tau += 2) {
    float sum = 0;
    for (int j = 0; j < n - tau; j += 2) {
      const float d = yinBuf_[j] - yinBuf_[j + tau];
      sum += d * d;
    }
    diff[tau] = sum * 2.f;
    if (tau + 1 < maxTau) {
      diff[tau + 1] = sum * 2.f;
    }
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

int AutoChords::quantizeMidi(float f0) const {
  const float midi = 69.f + 12.f * std::log2(f0 / 440.f);
  int nearest = static_cast<int>(std::round(midi));
  const int octave = static_cast<int>(std::floor(nearest / 12.f));
  const int pc = key_.snapPitchClass(nearest);
  return octave * 12 + pc;
}

void AutoChords::commitRoot(int midi) {
  activeRoot_ = midi;
  int third = 4;
  int fifth = 7;
  key_.triadIntervals(midi, &third, &fifth);

  int placed = midi;
  while (placed < 48) {
    placed += 12;
  }
  while (placed + fifth > 84) {
    placed -= 12;
  }
  if (placed < 48) {
    placed += 12;
  }

  const int rootShift = placed - midi;
  targetSemis_[0] = static_cast<float>(rootShift);
  targetSemis_[1] = static_cast<float>(rootShift + third);
  targetSemis_[2] = static_cast<float>(rootShift + fifth);
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
    const int midi = quantizeMidi(f0);
    if (midi == proposedMidi_) {
      ++proposedStableHops_;
    } else {
      proposedMidi_ = midi;
      proposedStableHops_ = 1;
    }

    const float hopSec = static_cast<float>(hop_) / static_cast<float>(sampleRate_);
    const int need = std::max(1, static_cast<int>(std::ceil((holdMs_ / 1000.f) / hopSec)));
    if (activeRoot_ < 0 || (midi != activeRoot_ && proposedStableHops_ >= need)) {
      commitRoot(midi);
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

  const float envTarget = (voiced_ && activeRoot_ >= 0) ? 1.f : 0.f;
  const float envCoeff = envTarget > env_ ? 0.0015f : 0.0003f;
  env_ += (envTarget - env_) * envCoeff;

  const float glide = 1.f - std::exp(-1.f / (0.09f * static_cast<float>(sampleRate_)));
  float harmony = 0.f;
  for (int i = 1; i < 3; ++i) {
    currentSemis_[i] += (targetSemis_[i] - currentSemis_[i]) * glide;
    voices_[i].setSemitones(currentSemis_[i]);
    harmony += voices_[i].process(voiceSample);
  }
  harmState_ += (harmony - harmState_) * 0.22f;
  return voiceSample + harmState_ * (0.34f * harmonyGain_ * env_);
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
      robotPhase_ += 72.f / static_cast<float>(sampleRate_);
      if (robotPhase_ >= 1.f) {
        robotPhase_ -= 1.f;
      }
      const float carrier = std::sin(2.f * static_cast<float>(M_PI) * robotPhase_);
      return x * (0.78f + 0.22f * carrier);
    }
    case VoiceMode::Chords:
      return chords_.process(x);
    default:
      return x;
  }
}
