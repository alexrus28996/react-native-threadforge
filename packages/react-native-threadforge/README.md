# ThreadForge — React Native Background Function Engine

> **Author:** Abhishek Kumar (alexrus28996)

ThreadForge turns React Native into a truly multithreaded environment. Pass any serializable JavaScript
function to `threadForge.runFunction()` and it executes inside an isolated Hermes runtime that lives on a
native C++ worker thread. Your UI thread stays free while heavy work happens in parallel.

## 🧩 Installation

```sh
npm install react-native-threadforge
# or
yarn add react-native-threadforge

cd ios && pod install
```

## ⚡ Initialize the engine

```ts
import { threadForge } from 'react-native-threadforge';

await threadForge.initialize(4); // spin up a 4-thread pool
```

## 🧮 Run any background function

```ts
const result = await threadForge.runFunction('PrimeFinder', () => {
  const primes: number[] = [];
  for (let n = 2; n < 100_000; n++) {
    if (primes.every((p) => n % p !== 0)) {
      primes.push(n);
    }
  }
  return primes.length;
});

console.log(`✅ Found ${result} primes`);
```

You can schedule multiple functions at once. Each runs inside a fresh Hermes runtime with an isolated
JS heap so closures and side effects never bleed back to the UI thread.

## 📊 Progress updates (optional)

Inside your function, call the global `reportProgress()` helper to emit throttled progress events. The
native layer caps emissions at 10 events per second.

```ts
await threadForge.runFunction('DataJob', () => {
  for (let i = 0; i < 100; i++) {
    heavyCompute(i);
    reportProgress(i / 100);
  }
  return 'done';
});

threadForge.onProgress((taskId, progress) => {
  console.log(`${taskId} → ${(progress * 100).toFixed(1)}%`);
});
```

## 🚀 Features

- Native C++17 thread pool with configurable size and task priorities
- Each task executes inside an isolated Hermes runtime (true parallelism)
- Works on both Android and iOS with a unified TypeScript API
- Promise-based results with full error and stack traces from Hermes
- Cooperative cancellation + queue removal via `threadForge.cancelTask(id)`
- Real-time progress events throttled in native code
- Runtime stats for monitoring (`threadForge.getStats()`)
- Zero third-party dependencies

## 🧠 API reference

```ts
class ThreadForgeEngine {
  initialize(threadCount?: number): Promise<void>;
  runFunction<T>(id: string, fn: () => T, priority?: TaskPriority): Promise<T>;
  cancelTask(id: string): Promise<boolean>;
  onProgress(listener: (taskId: string, progress: number) => void): EmitterSubscription;
  getStats(): Promise<{ threadCount: number; pending: number; active: number }>;
  shutdown(): Promise<void>;
}
```

`TaskPriority` exposes `LOW`, `NORMAL`, and `HIGH` to influence scheduling.

Returned values must be serializable with `JSON.stringify`. If a function throws, its message and stack
are propagated back to JavaScript and the promise rejects.

## ♻️ Lifecycle helpers

```ts
if (!threadForge.isInitialized()) {
  await threadForge.initialize();
}

const cancelled = await threadForge.cancelTask('upload-1');
console.log('cancelled?', cancelled);

const stats = await threadForge.getStats();
console.log(stats);

await threadForge.shutdown();
```

## 👤 Author

Abhishek Kumar ([@alexrus28996](https://github.com/alexrus28996))
Creator & Maintainer — ThreadForge: A native multithreading engine for React Native.
