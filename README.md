# 🚀 ThreadForge React Native Showcase

<p align="center">
  <img src="./docs/assets/threadforge-logo.png" alt="ThreadForge logo" width="380" />
</p>

**ThreadForge** is a high-performance React Native learning project demonstrating how to push CPU-intensive JavaScript tasks to background threads—without blocking the UI. It consists of:

- 🎛️ **Demo App (`src/`)** – An interactive React Native UI to initialize the thread pool, launch and cancel sample tasks, track live progress, and inspect stats.
- 🧩 **ThreadForge Native Module (`packages/react-native-threadforge/`)** – A reusable cross-platform engine that serializes JS functions, executes them in a C++ worker pool, and streams updates/results to JS.

> Built and maintained by [**Abhishek Kumar**](https://www.linkedin.com/in/i-am-abhishek-kumar/)

---

## ✨ Highlights at a Glance

| Feature | File/Location |
|--------|----------------|
| 🔁 Threaded task execution with cancellation and priority | [`src/index.ts`](./packages/react-native-threadforge/src/index.ts) |
| 📡 Real-time progress updates via event emitters | [`ThreadForgeModule.kt`](./packages/react-native-threadforge/android/...), [`ThreadForge.mm`](./packages/react-native-threadforge/ios/...) |
| ⚙️ Configurable defaults via env vars | [`config.ts`](./packages/react-native-threadforge/src/config.ts) |
| 🔒 Pre-serialized sources for Hermes compatibility | [`src/tasks`](./src/tasks) |
| 🧠 UI helpers and alerting | [`showAlert.ts`](./src/utils/showAlert.ts), [`App.tsx`](./src/App.tsx) |

---

## 🧪 Try the Demo Locally

```bash
# Install dependencies
npm install

# Start Metro bundler
npm start

# In another terminal:
npm run ios     # Requires Xcode + iOS Simulator
npm run android # Requires Android Studio + Emulator/device
```

⚠️ **Hermes is required**:
- ✅ Android: `hermesEnabled=true` (already set in [`android/gradle.properties`](./android/gradle.properties))
- ✅ iOS: `use_hermes!` enabled in [`ios/Podfile`](./ios/Podfile)

Run tests and lint checks:
```bash
npm test
npm run lint
```

---

## 🔍 Demo Task Gallery

UI logic lives in [`App.tsx`](./src/App.tsx) and wires to serializable factories using `ThreadTask` wrappers. This ensures the function body survives Hermes bytecode stripping.

| Task | File | Purpose |
|------|------|---------|
| 📐 Heavy Math | [`heavyMath.ts`](./src/tasks/heavyMath.ts) | Square root calculations with progress emission |
| ⏲️ Timer | [`timer.ts`](./src/tasks/timer.ts) | Delay-based task with cancelation support |
| 💬 Instant Message | [`instantMessage.ts`](./src/tasks/instantMessage.ts) | Lightweight task with instant return |
| 🖼️ Image Simulation | [`imageProcessing.ts`](./src/tasks/imageProcessing.ts) | Simulated pixel computation |
| 📊 Analytics | [`analytics.ts`](./src/tasks/analytics.ts) | Batch process fake events and return a summary |

🔄 **Bonus:** Run multiple jobs in parallel or cancel them interactively with built-in buttons!

---

## 🏗️ Native Architecture

| Layer | Responsibilities |
|-------|------------------|
| **JavaScript (TS)** | Input validation, task serialization, native communication, and result parsing |
| **Android (Kotlin + JNI)** | Calls into C++ pool, ensures Hermes is live, and emits progress events |
| **iOS (Objective-C++)** | GCD-based worker bridge, forwards events using RN emitter |
| **C++ Core** | Owns `ThreadPool`, `FunctionExecutor`, JSON serialization of results/errors |

🔁 Both platforms expose a unified API: `initialize`, `runFunction`, `cancelTask`, `getStats`, and `shutdown`

---

## 🗂️ Repository Structure

```
├─ App.tsx                        # Entrypoint to the demo app
├─ src/                           # Demo UI, task factories, utilities
├─ packages/
│  └─ react-native-threadforge/
│     ├─ android/                 # Android bridge (Kotlin + JNI)
│     ├─ ios/                     # iOS native module (Obj-C++)
│     ├─ cpp/                     # Cross-platform C++ core logic
│     └─ src/                     # TypeScript interface and public API
├─ docs/                          # Images and documentation assets
└─ __tests__/                     # Jest unit tests for helpers
```

---

## 👨‍💻 Author

- **Abhishek Kumar**  
  [LinkedIn ↗](https://www.linkedin.com/in/i-am-abhishek-kumar/)

Feel free to reach out with feedback, ideas, or questions.

---

## 💡 Tips & Best Practices

- ✅ Always call `shutdown()` after task execution to clean up resources
- 🔍 Use `getStats()` to monitor thread pool state and task load
- 🔧 Use `progressThrottleMs` to reduce bridge overhead for rapid updates
- 📤 Use `__threadforgeSource` in release mode to ensure function source isn't stripped
- 🧼 Keep your worklet functions pure and free from closures or external references

---

Enjoy hacking with background threads in React Native 🎉

---

## Quick Start

```
npm install react-native-threadforge
# or
yarn add react-native-threadforge
```

React Native ≥ 0.75 with Hermes or JSC.

## Usage (mount-time heavy compute, non-blocking UI)

```tsx
import { useEffect, useState } from 'react';
import threadForge, { TaskPriority, ThreadForgeCancelledError } from 'react-native-threadforge';

export default function Example() {
  const [value, setValue] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    let progressUnsub: { remove: () => void } | null = null;

    (async () => {
      try {
        await threadForge.initialize(4, { progressThrottleMs: 50 });

        // Optional: subscribe to progress (0..1)
        progressUnsub = threadForge.onProgress((_taskId, p) => {
          // console.log(`Progress: ${Math.round(p * 100)}%`);
        });

        // The worker function must be self-contained and serializable.
        // For Hermes release (bytecode-only), also provide __threadforgeSource (see note below).
        const { id, result } = await threadForge.run<number>(
          (() => {
            // Heavy CPU work
            let sum = 0;
            for (let i = 0; i < 10_000_000; i++) sum += i;
            return sum;
          }) as any,
          TaskPriority.NORMAL,
          { idPrefix: 'reduce' } // or pass { id: 'my-task-id' } to enable easy cancellation
        );

        if (mounted) setValue(result);
      } catch (e: any) {
        if (e instanceof ThreadForgeCancelledError) {
          setError('Task was cancelled');
        } else {
          setError(e?.message ?? String(e));
        }
      }
    })();

    return () => {
      mounted = false;
      if (progressUnsub) progressUnsub.remove();
    };
  }, []);

  if (error) return null;
  return null;
}
```

## Cancellation

Use a known taskId. With run(), either supply opts.id or read the returned id.

```ts
// Start a cancellable task
const { id, result } = await threadForge.run<number>(
  (() => {
    let sum = 0;
    for (let i = 0; i < 1_000_000_000; i++) {
      if (i % 10_000_000 === 0) {
        // if your native side supports it, you can report progress
        // reportProgress(i / 1_000_000_000);
      }
      sum += i;
    }
    return sum;
  }) as any,
  TaskPriority.HIGH,
  { id: 'long-task-1' }
);

// Somewhere else, cancel:
await threadForge.cancelTask('long-task-1');
```

When cancelled, the awaiting call rejects with ThreadForgeCancelledError.

## Hermes Release Builds (bytecode-only) and Serialization

Hermes can strip function source in release, which prevents serialization. Your runtime already guards this via the [bytecode] placeholder. To ensure workers run in release, attach explicit source:

```ts
const worker = (() => {
  let sum = 0;
  for (let i = 0; i < 5_000_000; i++) sum += i;
  return sum;
}) as any;

worker.__threadforgeSource = `
  (() => {
    let sum = 0;
    for (let i = 0; i < 5000000; i++) sum += i;
    return sum;
  })
`;

const { id, result } = await threadForge.run<number>(worker);
```

Rules for worker functions:

- Must be self-contained and pure (no captured outer variables).
- Must return JSON-serializable data (no Map/Set/BigInt/Functions).
- Avoid React state or RN APIs inside the worker.

## API

```ts
// Initialize & shutdown
threadForge.initialize(threadCount?: number, options?: { progressThrottleMs?: number }): Promise<void>;
threadForge.shutdown(): Promise<void>;
threadForge.isInitialized(): boolean;

// Core execution (new)
threadForge.run<T>(
  fn: () => T,
  priority?: TaskPriority,
  opts?: { id?: string; idPrefix?: string }
): Promise<{ id: string; result: T }>;

// Advanced (existing)
threadForge.runFunction<T>(id: string, fn: () => T, priority?: TaskPriority): Promise<T>;

// Cancellation & progress
threadForge.cancelTask(id: string): Promise<boolean>;
threadForge.onProgress((taskId: string, progress: number) => void): EmitterSubscription;

// Stats
threadForge.getStats(): Promise<{ threadCount: number; pending: number; active: number }>;
```

## FAQ

### Can ThreadForge run tasks synchronously?

No. React Native’s JS runs on a single thread; blocking it would freeze the UI. ThreadForge is intentionally async. The run() helper provides a clean, “sync-like” developer experience via await, while keeping UI responsive.
