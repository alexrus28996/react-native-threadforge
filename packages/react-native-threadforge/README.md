# ThreadForge — React Native Background Function Engine

> **Author:** Abhishek Kumar (alexrus28996)

ThreadForge turns React Native into a truly multithreaded environment. Pass any serializable JavaScript
function to `threadForge.runFunction()` and it executes inside an isolated Hermes runtime that lives on a
native C++ worker thread. Your UI thread stays free while heavy work happens in parallel.

> ℹ️ ThreadForge requires Hermes (the default JS engine on modern React Native versions). No extra setup is
> needed beyond installing the package and running `pod install` on iOS.

## 🗂️ Repository

The full demo application, native sources, and example screens live at
[`alexrus28996/react-native-threadforge`](https://github.com/alexrus28996/react-native-threadforge).
Open [`App.tsx`](https://github.com/alexrus28996/react-native-threadforge/blob/main/App.tsx) in the
repository for a production-style walkthrough of initialization, scheduling, cancellation, and progress
tracking.

## 🧩 Installation

```sh
npm install react-native-threadforge
# or
yarn add react-native-threadforge

cd ios && pod install
```

## 🏁 Quick start example

Drop the following snippet into a screen or test component to see a full round-trip of initialization,
execution, and UI updates. It mirrors the flow used in the demo app's `App.tsx` file but stripped down
to the essentials.

```tsx
import React, {useEffect, useState} from 'react';
import {Button, Text, View} from 'react-native';
import {threadForge} from 'react-native-threadforge';

export function DemoTask() {
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    threadForge.initialize(2);
    const sub = threadForge.onProgress((taskId, value) => {
      if (taskId === 'demo-task') {
        setProgress(value);
      }
    });
    return () => {
      sub.remove();
      threadForge.shutdown();
    };
  }, []);

  const start = async () => {
    const job = () => {
      let total = 0;
      for (let i = 0; i < 1_000_000; i++) {
        total += Math.sqrt(i);
        if (i % 100_000 === 0) {
          reportProgress(i / 1_000_000);
        }
      }
      reportProgress(1);
      return total.toFixed(0);
    };

    Object.defineProperty(job, '__threadforgeSource', {value: job.toString()});
    const output = await threadForge.runFunction('demo-task', job);
    setResult(output);
  };

  return (
    <View>
      <Button title="Run background job" onPress={start} />
      <Text>Progress: {(progress * 100).toFixed(0)}%</Text>
      <Text>Result: {result ?? '—'}</Text>
    </View>
  );
}
```

`reportProgress` is a global helper injected by ThreadForge whenever your function runs inside a worker
runtime. Use it to publish throttled progress events back to JavaScript listeners.

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

## 📱 Real world usage example

The snippet below wires `threadForge` into a React component that keeps the UI responsive while calculating
prime numbers on a background worker:

```tsx
import React, {useCallback, useEffect, useState} from 'react';
import {Button, SafeAreaView, Text} from 'react-native';
import {threadForge} from 'react-native-threadforge';

export function PrimeCounter() {
  const [isRunning, setRunning] = useState(false);
  const [primeCount, setPrimeCount] = useState<number | null>(null);

  useEffect(() => {
    threadForge.initialize(2).catch(console.error);
    return () => {
      threadForge.shutdown().catch(console.error);
    };
  }, []);

  const findPrimes = useCallback(async () => {
    setRunning(true);
    try {
      const result = await threadForge.runFunction('prime-job', () => {
        const primes: number[] = [];
        for (let n = 2; n < 50_000; n++) {
          if (primes.every((p) => n % p !== 0)) {
            primes.push(n);
          }
        }
        return primes.length;
      });
      setPrimeCount(result);
    } finally {
      setRunning(false);
    }
  }, []);

  return (
    <SafeAreaView style={{padding: 24}}>
      <Button title={isRunning ? 'Crunching…' : 'Compute primes'} onPress={findPrimes} disabled={isRunning} />
      <Text style={{marginTop: 16}}>
        {primeCount == null ? 'No results yet' : `Prime numbers under 50k: ${primeCount}`}
      </Text>
    </SafeAreaView>
  );
}
```

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

## 🧱 Hermes release builds

Hermes omits JavaScript source code when you create bytecode-only bundles (the default for release
builds). In that mode `fn.toString()` returns a placeholder like `[bytecode]`, which ThreadForge cannot
reconstruct into executable source for the background runtime. When this happens, `runFunction()` throws
with a detailed error.

To keep using ThreadForge in release, provide the original function source via the optional
`__threadforgeSource` property before scheduling the task:

```ts
const heavyWork = () => {
  let total = 0;
  for (let i = 0; i < 1_000_000; i++) {
    total += Math.sqrt(i);
  }
  return total;
};

Object.defineProperty(heavyWork, '__threadforgeSource', {
  value: `() => {
    let total = 0;
    for (let i = 0; i < 1_000_000; i++) {
      total += Math.sqrt(i);
    }
    return total;
  }`,
});

await threadForge.runFunction('heavy', heavyWork);
```

Helpers can encapsulate this pattern (see the demo app for one example). You can also construct workers
from strings at runtime to avoid source stripping entirely.

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
