#pragma once

#include <cstdint>
#include <vector>

enum class VoiceMode : int {
  Pitch = 0,
  Squeaky = 1,
  Robot = 2,
  Chords = 3
};

enum class OscType : int {
  Triangle = 0,
  Sine = 1
};

struct Key {
  int tonicPc = 0;
  int scale[7] = {0, 2, 4, 5, 7, 9, 11};

  int snapPitchClass(int pc) const;
  void triadIntervals(int rootPc, int* thirdSemis, int* fifthSemis) const;
};

class PitchShifter {
public:
  void setup(int sampleRate);
  void setSemitones(float semitones);
  void reset();
  float process(float x);

private:
  static constexpr int kGrain = 1024;
  std::vector<float> delay_;
  std::vector<float> window_;
  int writePos_ = 0;
  float grainA_ = 0;
  float grainB_ = 0;
  float ratio_ = 1.f;
  int sampleRate_ = 48000;
};

class OnePoleHighpass {
public:
  void setup(int sampleRate, float hz);
  float process(float x);

private:
  float a_ = 0;
  float prevX_ = 0;
  float prevY_ = 0;
};

class AutoChords {
public:
  void setup(int sampleRate);
  void setKey(const Key& key);
  void setHoldMs(float ms);
  void setHarmonyGain(float gain);
  void setOscType(OscType type);
  void reset();
  float process(float voiceSample);

private:
  void analyzeIfReady();
  bool detectPitch(float* f0, float* confidence);
  int quantizeMidi(float f0) const;
  void commitRoot(int midi);
  void applyRegister(int rootMidi, int thirdSemis, int fifthSemis, float* f0, float* f3, float* f5) const;
  float osc(float phase) const;

  Key key_{};
  OscType oscType_ = OscType::Triangle;
  int sampleRate_ = 48000;
  int hop_ = 512;
  int yinSize_ = 2048;
  float holdMs_ = 90.f;
  float harmonyGain_ = 0.18f;

  std::vector<float> yinBuf_;
  std::vector<float> yinDiff_;
  std::vector<float> yinCmnd_;
  int yinFill_ = 0;

  int proposedMidi_ = -1;
  int proposedStableHops_ = 0;
  int activeRoot_ = -1;

  float targetFreq_[3] = {261.63f, 329.63f, 392.f};
  float currentFreq_[3] = {261.63f, 329.63f, 392.f};
  float phase_[3] = {0, 0, 0};
  float env_ = 0;
  bool voiced_ = false;
};

class VoiceProcessor {
public:
  void setup(int sampleRate);
  void setMode(VoiceMode mode);
  void setPitchSemitones(float semis);
  void setHarmonyGain(float gain);
  void setChordHoldMs(float ms);
  void setOscType(OscType type);
  void reset();
  float process(float x);

private:
  VoiceMode mode_ = VoiceMode::Pitch;
  PitchShifter shifter_;
  OnePoleHighpass squeakHp_;
  AutoChords chords_;
  int sampleRate_ = 48000;
  float robotPhase_ = 0;
  float pitchSemis_ = 0.f;
  float squeakSemis_ = 10.f;
};
