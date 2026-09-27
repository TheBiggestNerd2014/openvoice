#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include "hotkeys.h"

#include <windows.h>

#include <algorithm>
#include <atomic>
#include <chrono>
#include <condition_variable>
#include <future>
#include <memory>
#include <mutex>
#include <thread>
#include <unordered_set>
#include <vector>

namespace {

constexpr UINT kWake = WM_APP + 1;
constexpr UINT kModAlt = 0x0001;
constexpr UINT kModControl = 0x0002;
constexpr UINT kModShift = 0x0004;
constexpr UINT kModWin = 0x0008;

struct Binding {
  int id = 0;
  UINT mods = 0;
  UINT vk = 0;
};

struct Job {
  enum Type { Add, Clear, Stop } type = Add;
  int id = 0;
  UINT mods = 0;
  UINT vk = 0;
  std::shared_ptr<std::promise<bool>> done;
};

std::mutex jobsMu;
std::vector<Job> jobs;
std::thread worker;
DWORD threadId = 0;
std::atomic<bool> running{false};
std::mutex startMu;
std::condition_variable startCv;
bool threadReady = false;

std::vector<Binding> bindings;
std::unordered_set<UINT> held;
std::unordered_set<UINT> swallowed;
HHOOK hook = nullptr;

LRESULT CALLBACK HookProc(int code, WPARAM wParam, LPARAM lParam);

std::mutex callbackMu;
Napi::ThreadSafeFunction callback;
bool hasCallback = false;

void Finish(const std::shared_ptr<std::promise<bool>>& done, bool ok) {
  if (done) {
    done->set_value(ok);
  }
}

bool Wait(const std::shared_ptr<std::promise<bool>>& done) {
  auto future = done->get_future();
  if (future.wait_for(std::chrono::seconds(2)) != std::future_status::ready) {
    return false;
  }
  return future.get();
}

bool KeyDown(int vk) {
  return (GetAsyncKeyState(vk) & 0x8000) != 0;
}

bool ModsMatch(UINT vk, UINT mods) {
  const bool keyCtrl = vk == VK_LCONTROL || vk == VK_RCONTROL || vk == VK_CONTROL;
  const bool keyShift = vk == VK_LSHIFT || vk == VK_RSHIFT || vk == VK_SHIFT;
  const bool keyAlt = vk == VK_LMENU || vk == VK_RMENU || vk == VK_MENU;
  const bool keyWin = vk == VK_LWIN || vk == VK_RWIN;

  bool ctrl = keyCtrl ? false : (KeyDown(VK_LCONTROL) || KeyDown(VK_RCONTROL));
  bool alt = keyAlt ? false : (KeyDown(VK_LMENU) || KeyDown(VK_RMENU));
  bool shift = keyShift ? false : (KeyDown(VK_LSHIFT) || KeyDown(VK_RSHIFT));
  bool win = keyWin ? false : (KeyDown(VK_LWIN) || KeyDown(VK_RWIN));
  if (vk == VK_RMENU) {
    ctrl = false;
  }
  return ctrl == ((mods & kModControl) != 0) && alt == ((mods & kModAlt) != 0) &&
         shift == ((mods & kModShift) != 0) && win == ((mods & kModWin) != 0);
}

UINT NormalizeVk(const KBDLLHOOKSTRUCT* kb) {
  const bool extended = (kb->flags & LLKHF_EXTENDED) != 0;
  if (kb->vkCode == VK_CONTROL) {
    return extended ? VK_RCONTROL : VK_LCONTROL;
  }
  if (kb->vkCode == VK_MENU) {
    return extended ? VK_RMENU : VK_LMENU;
  }
  if (kb->vkCode == VK_SHIFT) {
    return kb->scanCode == 0x36 ? VK_RSHIFT : VK_LSHIFT;
  }
  return kb->vkCode;
}

void Fire(int id) {
  std::lock_guard<std::mutex> lock(callbackMu);
  if (!hasCallback) {
    return;
  }
  auto* value = new int(id);
  if (callback.NonBlockingCall(value, [](Napi::Env env, Napi::Function js, int* data) {
        js.Call({Napi::Number::New(env, *data)});
        delete data;
      }) != napi_ok) {
    delete value;
  }
}

bool PassThrough(UINT vk) {
  return vk == VK_LCONTROL || vk == VK_RCONTROL || vk == VK_CONTROL || vk == VK_LSHIFT || vk == VK_RSHIFT ||
         vk == VK_SHIFT || vk == VK_LMENU || vk == VK_RMENU || vk == VK_MENU;
}

void RemoveHook() {
  if (hook) {
    UnhookWindowsHookEx(hook);
    hook = nullptr;
  }
  held.clear();
  swallowed.clear();
}

bool EnsureHook() {
  if (hook) {
    return true;
  }
  hook = SetWindowsHookExW(WH_KEYBOARD_LL, HookProc, nullptr, 0);
  return hook != nullptr;
}

LRESULT CALLBACK HookProc(int code, WPARAM wParam, LPARAM lParam) {
  if (code == HC_ACTION) {
    const auto* kb = reinterpret_cast<KBDLLHOOKSTRUCT*>(lParam);
    const UINT vk = NormalizeVk(kb);
    if (wParam == WM_KEYUP || wParam == WM_SYSKEYUP) {
      held.erase(vk);
      if (swallowed.erase(vk) > 0) {
        return 1;
      }
    } else if (wParam == WM_KEYDOWN || wParam == WM_SYSKEYDOWN) {
      if (swallowed.find(vk) != swallowed.end()) {
        return 1;
      }
      if (held.insert(vk).second) {
        bool eat = false;
        for (const Binding& binding : bindings) {
          if (binding.vk == vk && ModsMatch(vk, binding.mods)) {
            Fire(binding.id);
            if (!PassThrough(vk)) {
              eat = true;
            }
          }
        }
        if (eat) {
          swallowed.insert(vk);
          return 1;
        }
      }
    }
  }
  return CallNextHookEx(hook, code, wParam, lParam);
}

void Drain() {
  std::vector<Job> batch;
  {
    std::lock_guard<std::mutex> lock(jobsMu);
    batch.swap(jobs);
  }
  for (auto& job : batch) {
    if (job.type == Job::Stop) {
      bindings.clear();
      RemoveHook();
      Finish(job.done, true);
      PostQuitMessage(0);
      continue;
    }
    if (job.type == Job::Clear) {
      bindings.clear();
      RemoveHook();
      Finish(job.done, true);
      continue;
    }
    if (job.vk == 0) {
      Finish(job.done, false);
      continue;
    }
    bindings.erase(std::remove_if(bindings.begin(), bindings.end(),
                                  [&](const Binding& binding) { return binding.id == job.id; }),
                   bindings.end());
    const bool duplicate = std::any_of(bindings.begin(), bindings.end(), [&](const Binding& binding) {
      return binding.vk == job.vk && binding.mods == job.mods;
    });
    if (duplicate || !EnsureHook()) {
      Finish(job.done, false);
      continue;
    }
    bindings.push_back({job.id, job.mods, job.vk});
    Finish(job.done, true);
  }
}

void Loop() {
  MSG warmup;
  PeekMessageW(&warmup, nullptr, WM_USER, WM_USER, PM_NOREMOVE);
  {
    std::lock_guard<std::mutex> lock(startMu);
    threadId = GetCurrentThreadId();
    threadReady = true;
    running = true;
  }
  startCv.notify_one();

  MSG msg;
  while (GetMessageW(&msg, nullptr, 0, 0) > 0) {
    if (msg.message == kWake) {
      Drain();
    } else {
      TranslateMessage(&msg);
      DispatchMessageW(&msg);
    }
  }
  RemoveHook();
  running = false;
}

bool EnsureThread() {
  if (running.load() && worker.joinable()) {
    return true;
  }
  if (worker.joinable()) {
    worker.join();
  }
  {
    std::lock_guard<std::mutex> lock(startMu);
    threadReady = false;
  }
  worker = std::thread(Loop);
  std::unique_lock<std::mutex> lock(startMu);
  return startCv.wait_for(lock, std::chrono::seconds(2), [] { return threadReady; });
}

void PostJob(Job job) {
  if (!EnsureThread()) {
    Finish(job.done, false);
    return;
  }
  {
    std::lock_guard<std::mutex> lock(jobsMu);
    jobs.push_back(job);
  }
  if (PostThreadMessageW(threadId, kWake, 0, 0) || PostThreadMessageW(threadId, kWake, 0, 0)) {
    return;
  }
  std::lock_guard<std::mutex> lock(jobsMu);
  const auto it = std::find_if(jobs.begin(), jobs.end(), [&](const Job& queued) { return queued.done == job.done; });
  if (it != jobs.end()) {
    jobs.erase(it);
    Finish(job.done, false);
  }
}

}  // namespace

void SetHotkeyCallback(Napi::Env env, Napi::Function fn) {
  std::lock_guard<std::mutex> lock(callbackMu);
  if (hasCallback) {
    callback.Release();
    hasCallback = false;
  }
  callback = Napi::ThreadSafeFunction::New(env, fn, "openvoice-hotkeys", 0, 1);
  hasCallback = true;
}

bool RegisterNativeHotkey(int id, unsigned mods, unsigned vk) {
  auto done = std::make_shared<std::promise<bool>>();
  Job job;
  job.type = Job::Add;
  job.id = id;
  job.mods = mods;
  job.vk = vk;
  job.done = done;
  PostJob(std::move(job));
  return Wait(done);
}

void ClearNativeHotkeys() {
  if (!running.load()) {
    return;
  }
  auto done = std::make_shared<std::promise<bool>>();
  Job job;
  job.type = Job::Clear;
  job.done = done;
  PostJob(std::move(job));
  Wait(done);
}

void StopNativeHotkeys() {
  if (worker.joinable()) {
    auto done = std::make_shared<std::promise<bool>>();
    Job job;
    job.type = Job::Stop;
    job.done = done;
    PostJob(std::move(job));
    Wait(done);
    if (worker.joinable()) {
      worker.join();
    }
  }
  std::lock_guard<std::mutex> lock(callbackMu);
  if (hasCallback) {
    callback.Release();
    hasCallback = false;
  }
}
