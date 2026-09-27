#pragma once

#include <napi.h>

void SetHotkeyCallback(Napi::Env env, Napi::Function fn);
bool RegisterNativeHotkey(int id, unsigned mods, unsigned vk);
void ClearNativeHotkeys();
void StopNativeHotkeys();
