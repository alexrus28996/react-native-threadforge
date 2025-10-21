# ThreadForge React Native Showcase

<p align="center">
  <img src="./docs/assets/threadforge-logo.png" alt="ThreadForge logo" width="380" />
</p>

**ThreadForge** is a high-performance React Native library and demo project that demonstrates how to offload CPU-intensive JavaScript tasks to background threads — keeping your UI fast and responsive.

This repository contains:

- 🎛️ **Demo App (`src/`)** — A complete React Native UI showcasing initialization, live progress tracking, cancellation, and performance stats.  
- 🧩 **ThreadForge Native Module (`packages/react-native-threadforge/`)** — A reusable, cross-platform module that serializes JS functions, executes them on a native C++ worker pool, and streams results back to JS.

> Developed and maintained by [**Abhishek Kumar**](https://www.linkedin.com/in/i-am-abhishek-kumar/)

---

## ✨ Key Highlights

| Feature | File / Location |
|----------|-----------------|
| 🔁 Threaded task execution with cancellation and priority | [`index.ts`](./packages/react-native-threadforge/src/index.ts) |
| 📡 Real-time progress updates via event emitters | [`ThreadForgeModule.kt`](./packages/react-native-threadforge/android/...), [`ThreadForge.mm`](./packages/react-native-threadforge/ios/...) |
| ⚙️ Configurable defaults via constants | [`config.ts`](./packages/react-native-threadforge/src/config.ts) |
| 🔒 Hermes-safe pre-serialized tasks | [`src/tasks`](./src/tasks) |
| 🧠 UI and alert helpers | [`showAlert.ts`](./src/utils/showAlert.ts), [`App.tsx`](./src/App.tsx) |

---

## 🧪 Try the Demo Locally

```bash
# Install dependencies
npm install

# Start Metro
npm start

# In another terminal:
npm run ios     # Requires Xcode + iOS Simulator
npm run android # Requires Android Studio or an emulator/device
```

⚙️ **Hermes is required**  
- ✅ Android: `hermesEnabled=true` (already set in [`android/gradle.properties`](./android/gradle.properties))  
- ✅ iOS: `use_hermes!` enabled in [`ios/Podfile`](./ios/Podfile)

Run verification tasks:
```bash
npm test
npm run lint
```

---

## 🔍 Demo Task Gallery

The demo app (in [`App.tsx`](./src/App.tsx)) showcases various threaded workloads, all implemented as serializable, Hermes-safe task factories.

| Task | File | Description |
|------|------|-------------|
| 📐 **Heavy Math** | [`heavyMath.ts`](./src/tasks/heavyMath.ts) | Performs millions of square root operations with progress updates |
| ⏲️ **Timer** | [`timer.ts`](./src/tasks/timer.ts) | Simulates long-running delays with cancel support |
| 💬 **Instant Message** | [`instantMessage.ts`](./src/tasks/instantMessage.ts) | Lightweight synchronous result |
| 🖼️ **Image Simulation** | [`imageProcessing.ts`](./src/tasks/imageProcessing.ts) | Mock pixel-level computation |
| 📊 **Analytics** | [`analytics.ts`](./src/tasks/analytics.ts) | Aggregates fake data for summary output |

> You can run multiple jobs in parallel and cancel them interactively within the UI.

---

## 🏗️ Native Architecture Overview

| Layer | Role |
|-------|------|
| **JavaScript (TypeScript)** | Handles task serialization, validation, and native event communication |
| **Android (Kotlin + JNI)** | Connects to native C++ pool, manages Hermes VMs, emits progress events |
| **iOS (Objective-C++)** | Uses GCD threads, bridges events to JS |
| **C++ Core** | Manages thread pool, executes functions, and serializes results/errors |

✅ Unified API across all platforms:  
`initialize`, `runFunction`, `cancelTask`, `getStats`, and `shutdown`.

---

## 🗂️ Project Structure

```
├─ App.tsx                        # Demo entry point
├─ src/                           # UI components, task factories, utilities
├─ packages/
│  └─ react-native-threadforge/
│     ├─ android/                 # Android native bridge
│     ├─ ios/                     # iOS native bridge
│     ├─ cpp/                     # Shared C++ thread pool and logic
│     └─ src/                     # TypeScript interface and public API
├─ docs/                          # Documentation and assets
└─ __tests__/                     # Jest unit tests
```

---

## 👨‍💻 Author

**Abhishek Kumar**  
[LinkedIn ↗](https://www.linkedin.com/in/i-am-abhishek-kumar/)

---

## 💡 Best Practices

- ✅ Always call `shutdown()` after tasks complete  
- 🔍 Use `getStats()` to monitor pool status  
- ⚙️ Adjust `progressThrottleMs` for high-frequency updates  
- 🧩 Always define `__threadforgeSource` for Hermes release builds  
- 🧼 Keep worker functions pure — no closures, state, or React hooks  

---

## ⚡ Quick Start with Library

Install:
```bash
npm install react-native-threadforge
# or
yarn add react-native-threadforge
```

Supports React Native ≥ **0.75**, Hermes or JSC.

---

## Example — Non-Blocking Heavy Compute (Mount-Time)

```tsx
import React, { useEffect, useState } from 'react';
import { SafeAreaView, Text, Button, View, StyleSheet, Alert } from 'react-native';
import { threadForge, TaskPriority } from 'react-native-threadforge';

const App = () => {
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState<{ [key: string]: number }>({});

  useEffect(() => {
    let unsub: any = null;

    const init = async () => {
      try {
        await threadForge.initialize(4);
        unsub = threadForge.onProgress((id, value) => {
          setProgress(prev => ({ ...prev, [id]: value }));
        });
        setReady(true);
      } catch (e) {
        Alert.alert('Init failed', String(e));
      }
    };

    init();
    return () => {
      unsub?.remove?.();
      threadForge.shutdown();
    };
  }, []);

  const createHeavyMathTask = () => {
    const fn: any = () => {};
    fn.__threadforgeSource = `
      () => {
        let total = 0;
        for (let i = 0; i < 1e6; i++) {
          total += Math.sqrt(i);
          if (i % 100000 === 0) globalThis.reportProgress?.(i / 1e6);
        }
        globalThis.reportProgress?.(1);
        return { task: 'Heavy Math', sum: total.toFixed(2) };
      }
    `;
    return fn;
  };

  const createTimerTask = (durationMs = 5000) => {
    const fn: any = () => {};
    fn.__threadforgeSource = `
      () => {
        const start = Date.now();
        while (Date.now() - start < ${durationMs}) {
          const elapsed = Date.now() - start;
          globalThis.reportProgress?.(elapsed / ${durationMs});
        }
        globalThis.reportProgress?.(1);
        return { task: 'Timer', waited: ${durationMs} };
      }
    `;
    return fn;
  };

  const runBoth = async () => {
    if (!ready) return Alert.alert('Wait', 'ThreadForge not initialized');

    try {
      const [mathRes, timerRes] = await Promise.all([
        threadForge.runFunction('math', createHeavyMathTask(), TaskPriority.HIGH),
        threadForge.runFunction('timer', createTimerTask(5000), TaskPriority.NORMAL),
      ]);
      Alert.alert('Both Done', JSON.stringify({ mathRes, timerRes }, null, 2));
    } catch (e) {
      Alert.alert('Error', String(e));
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>ThreadForge — Dual Tasks</Text>
      <Button title="Run Two Background Tasks" onPress={runBoth} disabled={!ready} />
      <View style={{ marginTop: 24 }}>
        <Text style={styles.progress}>
          Heavy Math: {Math.round((progress['math'] ?? 0) * 100)}%
        </Text>
        <Text style={styles.progress}>
          Timer: {Math.round((progress['timer'] ?? 0) * 100)}%
        </Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#111827' },
  title: { fontSize: 20, color: '#f9fafb', marginBottom: 16 },
  progress: { color: '#a5b4fc', marginTop: 6, fontSize: 16 },
});

export default App;
```

---

## 🛑 Task Cancellation

```ts
// Start task
const { id } = await threadForge.run<number>(
  (() => {
    let total = 0;
    for (let i = 0; i < 1_000_000_000; i++) total += i;
    return total;
  }) as any,
  TaskPriority.HIGH,
  { id: 'long-task-1' }
);

// Cancel anytime
await threadForge.cancelTask('long-task-1');
```

Cancellation throws a `ThreadForgeCancelledError` in JS.

---

## 🧩 Hermes Release Mode & Serialization

Hermes may strip function sources in release. Always attach explicit code:

```ts
const fn: any = () => {};
fn.__threadforgeSource = `
  (() => {
    let sum = 0;
    for (let i = 0; i < 5_000_000; i++) sum += i;
    return sum;
  })
`;

const { id, result } = await threadForge.run(fn);
```

### Function Rules
- Must be **pure and self-contained**  
- Must return **JSON-serializable** results  
- Avoid React hooks, closures, or external variables  

---

## 🧠 API Reference

```ts
// Initialization
threadForge.initialize(threadCount?: number, options?: { progressThrottleMs?: number }): Promise<void>;
threadForge.shutdown(): Promise<void>;
threadForge.isInitialized(): boolean;

// Execution
threadForge.run<T>(fn: () => T, priority?: TaskPriority, opts?: { id?: string; idPrefix?: string }): Promise<{ id: string; result: T }>;
threadForge.runFunction<T>(id: string, fn: () => T, priority?: TaskPriority): Promise<T>;

// Control
threadForge.cancelTask(id: string): Promise<boolean>;
threadForge.onProgress((taskId: string, progress: number) => void): EmitterSubscription;

// Stats
threadForge.getStats(): Promise<{ threadCount: number; pending: number; active: number }>;
```

---

## ❓ FAQ

### Can ThreadForge run tasks synchronously?
No. React Native’s JavaScript runs on a single thread — synchronous blocking would freeze your UI.  
`run()` gives a **sync-like** `await` experience while executing safely in background threads.

---

Enjoy blazing-fast, thread-safe performance in React Native ⚡  
**ThreadForge — where background work meets native speed.**
