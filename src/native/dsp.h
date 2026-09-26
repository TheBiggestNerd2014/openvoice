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
  static constexpr int kLen = 4096;
  std::vector<float> delay_;
  int writePos_ = 0;
  float behindA_ = 0;
  float behindB_ = 0;
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
  int quantizeFromMidi(float midi) const;
  int pickRandomRoot(float midi);
  void commitRoot(int midi);
  void retarget();

  Key key_{};
  int sampleRate_ = 48000;
  int hop_ = 768;
  int yinSize_ = 1024;
  float holdMs_ = 90.f;
  float harmonyGain_ = 1.f;

  std::vector<float> yinBuf_;
  std::vector<float> yinDiff_;
  std::vector<float> yinCmnd_;
  int yinFill_ = 0;

  int proposedMidi_ = -1;
  int proposedStableHops_ = 0;
  int activeRoot_ = -1;
  int thirdSemis_ = 4;
  int fifthSemis_ = 7;
  float smoothedMidi_ = 60.f;
  bool haveMidi_ = false;
  int hangSamples_ = 0;
  float midiHist_[5] = {};
  int histPos_ = 0;
  int histCount_ = 0;
  float anchorMidi_ = 60.f;
  int unvoicedHops_ = 0;
  uint32_t rngState_ = 0xC0FFEEu;

  float targetSemis_[3] = {0.f, 4.f, 7.f};
  float currentSemis_[3] = {0.f, 4.f, 7.f};
  PitchShifter voices_[3];
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
  float robotHold_ = 0;
  int robotHoldCount_ = 0;
  float pitchSemis_ = 0.f;
  float squeakSemis_ = 8.f;
};
