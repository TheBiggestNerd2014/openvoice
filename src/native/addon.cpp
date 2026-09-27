#include "engine.h"
#include "hotkeys.h"

#include <napi.h>

namespace {

Napi::Array devicesToArray(Napi::Env env, const std::vector<AudioDeviceInfo>& devices) {
  Napi::Array arr = Napi::Array::New(env, devices.size());
  for (size_t i = 0; i < devices.size(); ++i) {
    Napi::Object o = Napi::Object::New(env);
    o.Set("id", devices[i].id);
    o.Set("name", devices[i].name);
    o.Set("isDefault", devices[i].isDefault);
    arr.Set(static_cast<uint32_t>(i), o);
  }
  return arr;
}

Napi::Value ListDevices(const Napi::CallbackInfo& info) {
  const auto lists = Engine::instance().listDevices();
  Napi::Object o = Napi::Object::New(info.Env());
  o.Set("inputs", devicesToArray(info.Env(), lists.inputs));
  o.Set("outputs", devicesToArray(info.Env(), lists.outputs));
  return o;
}

Napi::Value Start(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  std::string input, cable, monitor;
  if (info.Length() > 0 && info[0].IsObject()) {
    Napi::Object o = info[0].As<Napi::Object>();
    if (o.Has("inputId")) input = o.Get("inputId").ToString().Utf8Value();
    if (o.Has("cableId")) cable = o.Get("cableId").ToString().Utf8Value();
    if (o.Has("monitorId")) monitor = o.Get("monitorId").ToString().Utf8Value();
  }
  std::string error;
  if (!Engine::instance().start(input, cable, monitor, &error)) {
    Napi::Error::New(env, error.empty() ? "Failed to start audio" : error).ThrowAsJavaScriptException();
    return env.Undefined();
  }
  return env.Undefined();
}

Napi::Value Stop(const Napi::CallbackInfo& info) {
  Engine::instance().stop();
  return info.Env().Undefined();
}

Napi::Value Status(const Napi::CallbackInfo& info) {
  Napi::Object o = Napi::Object::New(info.Env());
  o.Set("running", Engine::instance().running());
  o.Set("cablePresent", Engine::instance().cablePresent());
  o.Set("voiceOn", Engine::instance().voiceEnabled());
  o.Set("monitorOn", Engine::instance().monitorEnabled());
  return o;
}

Napi::Value FindCable(const Napi::CallbackInfo& info) {
  std::string id;
  std::string name;
  Napi::Object o = Napi::Object::New(info.Env());
  const bool found = Engine::instance().findCableOutputId(&id, &name);
  o.Set("found", found);
  o.Set("id", id);
  o.Set("name", name);
  return o;
}

Napi::Value SetVoiceEnabled(const Napi::CallbackInfo& info) {
  if (info.Length() > 0) {
    Engine::instance().setVoiceEnabled(info[0].ToBoolean());
  }
  return info.Env().Undefined();
}

Napi::Value SetMonitorEnabled(const Napi::CallbackInfo& info) {
  if (info.Length() > 0) {
    Engine::instance().setMonitorEnabled(info[0].ToBoolean());
  }
  return info.Env().Undefined();
}

Napi::Value SetMode(const Napi::CallbackInfo& info) {
  if (info.Length() > 0) {
    Engine::instance().setMode(info[0].ToNumber().Int32Value());
  }
  return info.Env().Undefined();
}

Napi::Value SetPitch(const Napi::CallbackInfo& info) {
  if (info.Length() > 0) {
    Engine::instance().setPitchSemitones(info[0].ToNumber().FloatValue());
  }
  return info.Env().Undefined();
}

Napi::Value SetInputGain(const Napi::CallbackInfo& info) {
  if (info.Length() > 0) {
    Engine::instance().setInputGain(info[0].ToNumber().FloatValue());
  }
  return info.Env().Undefined();
}

Napi::Value SetOutputGain(const Napi::CallbackInfo& info) {
  if (info.Length() > 0) {
    Engine::instance().setOutputGain(info[0].ToNumber().FloatValue());
  }
  return info.Env().Undefined();
}

Napi::Value SetPadGain(const Napi::CallbackInfo& info) {
  if (info.Length() > 0) {
    Engine::instance().setPadGain(info[0].ToNumber().FloatValue());
  }
  return info.Env().Undefined();
}

Napi::Value SetHarmonyGain(const Napi::CallbackInfo& info) {
  if (info.Length() > 0) {
    Engine::instance().setHarmonyGain(info[0].ToNumber().FloatValue());
  }
  return info.Env().Undefined();
}

Napi::Value SetChordHoldMs(const Napi::CallbackInfo& info) {
  if (info.Length() > 0) {
    Engine::instance().setChordHoldMs(info[0].ToNumber().FloatValue());
  }
  return info.Env().Undefined();
}

Napi::Value GetMeters(const Napi::CallbackInfo& info) {
  float in = 0;
  float out = 0;
  Engine::instance().getMeters(&in, &out);
  Napi::Object o = Napi::Object::New(info.Env());
  o.Set("input", in);
  o.Set("output", out);
  return o;
}

Napi::Value LoadPad(const Napi::CallbackInfo& info) {
  if (info.Length() < 2) {
    return Napi::Boolean::New(info.Env(), false);
  }
  const int id = info[0].ToNumber().Int32Value();
  const std::string path = info[1].ToString().Utf8Value();
  std::string error;
  if (!Engine::instance().loadPad(id, path, &error)) {
    Napi::Error::New(info.Env(), error.empty() ? "Failed to load pad" : error).ThrowAsJavaScriptException();
    return info.Env().Undefined();
  }
  return Napi::Boolean::New(info.Env(), true);
}

Napi::Value UnloadPad(const Napi::CallbackInfo& info) {
  if (info.Length() > 0) {
    Engine::instance().unloadPad(info[0].ToNumber().Int32Value());
  }
  return info.Env().Undefined();
}

Napi::Value PlayPad(const Napi::CallbackInfo& info) {
  if (info.Length() > 0) {
    Engine::instance().playPad(info[0].ToNumber().Int32Value());
  }
  return info.Env().Undefined();
}

Napi::Value StopPad(const Napi::CallbackInfo& info) {
  if (info.Length() > 0) {
    Engine::instance().stopPad(info[0].ToNumber().Int32Value());
  }
  return info.Env().Undefined();
}

Napi::Value SetHotkeyCallbackExport(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsFunction()) {
    Napi::TypeError::New(env, "Expected a function").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  SetHotkeyCallback(env, info[0].As<Napi::Function>());
  return env.Undefined();
}

Napi::Value RegisterHotkeyExport(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 3) {
    return Napi::Boolean::New(env, false);
  }
  const int id = info[0].ToNumber().Int32Value();
  const unsigned mods = info[1].ToNumber().Uint32Value();
  const unsigned vk = info[2].ToNumber().Uint32Value();
  return Napi::Boolean::New(env, RegisterNativeHotkey(id, mods, vk));
}

Napi::Value ClearHotkeysExport(const Napi::CallbackInfo& info) {
  ClearNativeHotkeys();
  return info.Env().Undefined();
}

Napi::Value StopHotkeysExport(const Napi::CallbackInfo& info) {
  StopNativeHotkeys();
  return info.Env().Undefined();
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("listDevices", Napi::Function::New(env, ListDevices));
  exports.Set("start", Napi::Function::New(env, Start));
  exports.Set("stop", Napi::Function::New(env, Stop));
  exports.Set("status", Napi::Function::New(env, Status));
  exports.Set("findCable", Napi::Function::New(env, FindCable));
  exports.Set("setVoiceEnabled", Napi::Function::New(env, SetVoiceEnabled));
  exports.Set("setMonitorEnabled", Napi::Function::New(env, SetMonitorEnabled));
  exports.Set("setMode", Napi::Function::New(env, SetMode));
  exports.Set("setPitchSemitones", Napi::Function::New(env, SetPitch));
  exports.Set("setInputGain", Napi::Function::New(env, SetInputGain));
  exports.Set("setOutputGain", Napi::Function::New(env, SetOutputGain));
  exports.Set("setPadGain", Napi::Function::New(env, SetPadGain));
  exports.Set("setHarmonyGain", Napi::Function::New(env, SetHarmonyGain));
  exports.Set("setChordHoldMs", Napi::Function::New(env, SetChordHoldMs));
  exports.Set("getMeters", Napi::Function::New(env, GetMeters));
  exports.Set("loadPad", Napi::Function::New(env, LoadPad));
  exports.Set("unloadPad", Napi::Function::New(env, UnloadPad));
  exports.Set("playPad", Napi::Function::New(env, PlayPad));
  exports.Set("stopPad", Napi::Function::New(env, StopPad));
  exports.Set("setHotkeyCallback", Napi::Function::New(env, SetHotkeyCallbackExport));
  exports.Set("registerHotkey", Napi::Function::New(env, RegisterHotkeyExport));
  exports.Set("clearHotkeys", Napi::Function::New(env, ClearHotkeysExport));
  exports.Set("stopHotkeys", Napi::Function::New(env, StopHotkeysExport));
  return exports;
}

} // namespace

NODE_API_MODULE(openvoice_audio, Init)
