# React Native Threadforge

![ThreadForge logo](https://raw.githubusercontent.com/alexrus28996/react-native-threadforge/main/docs/assets/threadforge-logo.png)

**ThreadForge** brings real multi-threading to React Native.  
It executes serializable JavaScript functions on background threads using a high-performance C++ worker pool — keeping your main thread fast and fluid.

Crafted by [**Abhishek Kumar**](https://www.linkedin.com/in/i-am-abhishek-kumar/)

---

## Table of Contents
1. [Overview](#overview)
2. [Features](#features)
3. [Installation](#installation)
4. [Demo](#demo)
5. [Hermes Setup](#hermes-setup)
6. [Quick Start Example](#quick-start-example)
7. [Dual Background Task Example](#dual-background-task-example)
8. [Comparison with Other Libraries](#comparison-with-other-libraries)
9. [Common Errors & Fixes](#common-errors--fixes)
10. [Architecture](#architecture)
11. [Best Practices](#best-practices)
12. [License](#license)

---

## Overview

`react-native-threadforge` bridges the gap between React Native’s single-threaded JavaScript runtime and native multi-core performance.  
It allows you to execute serializable JS functions in isolated background threads powered by a native C++ worker pool and dedicated Hermes VMs.

This helps developers offload heavy computation without affecting UI performance — ideal for:

- Mathematical or data-intensive calculations  
- File or image processing  
- Encryption, compression, or decompression  
- Long-running background tasks  

---

## Features

- **True Background Multi-Threading** — Execute JS logic off the main thread.  
- **Hermes & JSC Compatible** — Works in both Debug and Release builds.  
- **Progress & Cancellation APIs** — Real-time feedback and control.  
- **Configurable Thread Pool** — Define concurrency levels and task priorities.  
- **TypeScript-First Design** — Strongly typed API for safer development.  
- **Native C++ Core** — Low-latency execution and high stability.

---

## Installation

```bash
npm install react-native-threadforge
# or
yarn add react-native-threadforge
```

Then link native modules:

```bash
npx pod-install
```

### Requirements
- React Native **0.70+**
- Android NDK / Xcode
- Hermes enabled (recommended)

---

## Demo

![ThreadForge demo](https://raw.githubusercontent.com/alexrus28996/react-native-threadforge/main/docs/assets/threadforge-demo.gif)

<details>
<summary>Static Preview</summary>

![ThreadForge task list]((https://raw.githubusercontent.com/alexrus28996/react-native-threadforge/main/docs/assets/threadforge-demo.jpeg)
</details>

Try the demo app:

```bash
git clone https://github.com/alexrus28996/react-native-threadforge.git
cd react-native-threadforge
npm install
npm run android   # or npm run ios
```

---

## Hermes Setup

ThreadForge supports both Hermes and JSC, but Hermes removes function source text in Release builds.  
To ensure proper execution, provide function source manually via `__threadforgeSource`.

### Check Hermes Status
```ts
console.log('Hermes enabled:', !!global.HermesInternal);
```

### Enable / Disable Hermes

**Android →** `android/gradle.properties`
```properties
hermesEnabled=true
```

**iOS →** `Podfile`
```ruby
use_react_native!(
  :hermes_enabled => true
)
```

Then rebuild your project:
```bash
cd android && ./gradlew clean && cd ..
npx react-native run-android
```

---

## Quick Start Example

This example works in Debug & Release, with Hermes ON or OFF.

```tsx
import React, { useEffect, useState } from 'react';
import { SafeAreaView, Text, Button, Alert, StyleSheet } from 'react-native';
import {
  threadForge,
  TaskPriority,
  ThreadForgeCancelledError,
} from 'react-native-threadforge';

const App = () => {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const init = async () => {
      await threadForge.initialize();
      setReady(true);
    };
    init();
    return () => threadForge.shutdown();
  }, []);

  const runHeavyTask = async () => {
    if (!ready) return Alert.alert('Wait', 'ThreadForge not initialized');

    const fn: any = () => {};
    fn.__threadforgeSource = `
      () => {
        let sum = 0;
        for (let i = 0; i < 1e6; i++) {
          sum += Math.sqrt(i);
          if (i % 100000 === 0) globalThis.reportProgress?.(i / 1e6);
        }
        globalThis.reportProgress?.(1);
        return { message: 'Worker Done', sum: sum.toFixed(2) };
      }
    `;

    try {
      const result = await threadForge.runFunction('heavy', fn, TaskPriority.HIGH);
      Alert.alert('Task Complete', JSON.stringify(result, null, 2));
    } catch (err) {
      if (err instanceof ThreadForgeCancelledError)
        Alert.alert('Cancelled', 'Task was cancelled');
      else Alert.alert('Error', String(err));
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>ThreadForge Demo</Text>
      <Button title="Run Background Task" onPress={runHeavyTask} disabled={!ready} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a' },
  title: { fontSize: 20, color: '#61dafb', marginBottom: 8 },
});

export default App;
```

---

## Dual Background Task Example

Demonstrates two independent background threads running concurrently.

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

## Comparison with Other Libraries

| Library | True Native Worker Threads | Hermes Safe | Progress API | Cancellation | TypeScript | Notes |
|----------|----------------------------|--------------|---------------|--------------|-------------|--------|
| **react-native-threadforge** | ✅ C++ thread pool + Hermes VM | ✅ Full | ✅ Built-in | ✅ Yes | ✅ Full | Modern, stable, production-ready |
| react-native-multithreading | ✅ JSI threads | ⚠️ Partial | ⚠️ Limited | ⚠️ No | ✅ Yes | Experimental |
| react-native-threads | ✅ Separate JS processes | ❌ No | ❌ None | ❌ No | ✅ Basic | Legacy |
| react-native-multithreads | ✅ Multi-process | ❌ No | ❌ None | ❌ No | ✅ Yes | Heavy resource usage |

**Why ThreadForge leads:**  
- Native C++ core with isolated Hermes VMs  
- Fully Hermes-safe serialization  
- Progress and cancellation built-in  
- TypeScript-first design  
- Optimized for real-world production apps

---

## Common Errors & Fixes

| Error | Cause | Fix |
|-------|--------|-----|
| `ThreadForge has not been initialized` | Function called before init | Use `await threadForge.initialize()` |
| `could not serialize the provided function` | Hermes stripped function | Add `fn.__threadforgeSource` |
| `ReadableNativeMap` error | Passing objects to `Alert` | Wrap with `JSON.stringify(result)` |
| `Property 'console' doesn't exist` | No console in worker VM | Use `reportProgress()` |

---

## Architecture

```
JavaScript Layer     → TypeScript interface for tasks
Bridge Layer         → JSON serialization & communication
Native Core (C++)    → Thread pool + Hermes VM per worker
Platform Bridges     → Kotlin (Android), Obj-C++ (iOS)
```

Each worker runs in an isolated Hermes VM — ensuring safe, predictable concurrency with minimal overhead.

---

## Best Practices

- Always call `threadForge.shutdown()` on unmount.  
- Keep worker functions pure (no closures / React hooks).  
- Use `getStats()` for monitoring.  
- Prefer small JSON outputs for speed.  
- For Hermes builds, always include `__threadforgeSource`.

---

## License

MIT License  
Developed by [Abhishek Kumar](https://www.linkedin.com/in/i-am-abhishek-kumar/)

---

**ThreadForge — Real native multi-threading for React Native, built for performance, stability, and scale.**
