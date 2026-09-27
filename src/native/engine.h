#pragma once

#include "dsp.h"

#include <atomic>
#include <cstdint>
#include <mutex>
#include <string>
#include <vector>

struct AudioDeviceInfo {
  std::string id;
  std::string name;
  bool isDefault = false;
};

struct DeviceLists {
  std::vector<AudioDeviceInfo> inputs;
  std::vector<AudioDeviceInfo> outputs;
};

class Engine {
public:
  static Engine& instance();

  DeviceLists listDevices() const;
  bool start(const std::string& inputId, const std::string& cableId, const std::string& monitorId, std::string* error);
  void stop();
  bool running() const;
  bool cablePresent() const;

  void setVoiceEnabled(bool on);
  void setMonitorEnabled(bool on);
  void setMode(int mode);
  void setPitchSemitones(float semis);
  void setInputGain(float g);
  void setOutputGain(float g);
  void setPadGain(float g);
  void setHarmonyGain(float g);
  void setChordHoldMs(float ms);
  void getMeters(float* input, float* output) const;
  bool voiceEnabled() const;
  bool monitorEnabled() const;

  bool loadPad(int id, const std::string& path, std::string* error);
  void unloadPad(int id);
  void playPad(int id, bool stopIfPlaying);
  void stopPad(int id);

  bool findCableOutputId(std::string* id, std::string* name) const;

  void onCapture(const float* input, unsigned frameCount, unsigned channels);
  float pullPlayback(bool monitor);

private:
  Engine() = default;
  Engine(const Engine&) = delete;
  Engine& operator=(const Engine&) = delete;

  struct Pad {
    std::vector<float> pcm;
    std::atomic<int> frames{0};
    std::atomic<int> playPos{-1};
    std::atomic<float> volume{1.f};
  };

  static constexpr int kMaxPads = 32;
  static constexpr int kSampleRate = 48000;

  struct Ring {
    std::vector<float> data;
    std::atomic<uint32_t> write{0};
    std::atomic<uint32_t> read{0};

    void setup(size_t n) {
      data.assign(n, 0.f);
      write.store(0);
      read.store(0);
    }

    void writeSample(float s) {
      if (data.empty()) {
        return;
      }
      const uint32_t n = static_cast<uint32_t>(data.size());
      const uint32_t w = write.load(std::memory_order_relaxed);
      const uint32_t r = read.load(std::memory_order_acquire);
      const uint32_t next = (w + 1) % n;
      if (next == r) {
        return;
      }
      data[w] = s;
      write.store(next, std::memory_order_release);
    }

    float readSample() {
      if (data.empty()) {
        return 0.f;
      }
      const uint32_t n = static_cast<uint32_t>(data.size());
      const uint32_t r = read.load(std::memory_order_relaxed);
      const uint32_t w = write.load(std::memory_order_acquire);
      if (r == w) {
        return 0.f;
      }
      const float s = data[r];
      read.store((r + 1) % n, std::memory_order_release);
      return s;
    }
  };

  bool startPlayback(void** slot, const std::string& idHex, bool monitor, std::string* error);

  void* context_ = nullptr;
  void* capture_ = nullptr;
  void* cable_ = nullptr;
  void* monitorDev_ = nullptr;

  Ring cableRing_{};
  Ring monitorRing_{};
  VoiceProcessor voice_{};

  std::vector<float> outHist_;
  std::vector<float> micHist_;
  int outWrite_ = 0;
  int bestLag_ = 1440;
  float echoCorr_ = 0.f;
  float echoPower_ = 0.f;
  float micPower_ = 0.f;
  float duck_ = 1.f;
  float gateEnv_ = 0.f;
  float hpX_ = 0.f;
  float hpY_ = 0.f;

  float suppressFeedback(float mic);
  void rememberOutput(float sample);
  void updateFeedbackLag();

  std::atomic<bool> running_{false};
  std::atomic<bool> voiceOn_{false};
  std::atomic<bool> monitorOn_{false};
  std::atomic<bool> cableUp_{false};
  std::atomic<float> inputGain_{1.f};
  std::atomic<float> outputGain_{1.f};
  std::atomic<float> padGain_{1.f};
  std::atomic<float> inMeter_{0};
  std::atomic<float> outMeter_{0};

  Pad pads_[kMaxPads];
  std::mutex padMutex_;
};
