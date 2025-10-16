# ThreadForge Demo App & Library

ThreadForge is a React Native playground that shows how to move CPU heavy JavaScript work onto a native
thread pool. The repository contains two pieces:

- **Demo application (`src/`, `App.tsx`)** – buttons that trigger real background jobs so you can see the
  engine in action.
- **Reusable library (`packages/react-native-threadforge`)** – the package you publish or install inside a
  product app.

The goal of this README is to help you try the demo quickly and copy the library patterns into your own
project without guessing.

---

## 1. Run the demo in five minutes

```bash
# 1. Install dependencies
npm install

# 2. Start Metro
npm start

# 3. In a second terminal, launch the platform you care about
npm run android   # or: npm run ios
```

Once the app is running you can tap the buttons to queue different background jobs:

| Button | What it does |
| --- | --- |
| **Run Heavy Math** | Crunches millions of `Math.sqrt` calls and streams progress updates. |
| **Run 5-Second Timer** | Busy-waits for ~5 seconds while emitting percentage progress. |
| **Instant Message** | Returns a string immediately to demonstrate low priority jobs. |
| **Run Parallel Batch** | Queues four heavy math tasks at once to show multi-threading. |
| **Image Processing & Analytics** | Kicks off two different tasks with different priorities. |

The counter at the top keeps ticking to prove that the JS thread never blocks.

---

## 2. Understand the important files

| Path | Why it matters |
| --- | --- |
| [`src/App.tsx`](./src/App.tsx) | Complete example of initializing the engine, scheduling work, handling progress, cancelling, and shutting down. |
| [`src/tasks/*.ts`](./src/tasks) | Ready-made worker factories you can copy into your own code. |
| [`packages/react-native-threadforge/src`](./packages/react-native-threadforge/src) | Public TypeScript API for the `threadForge` engine. |
| [`packages/react-native-threadforge/ios` and `/android`](./packages/react-native-threadforge) | Native bridge + thread pool implementation. |

---

## 3. Use ThreadForge in your app

### Install the package

```bash
npm install react-native-threadforge
# and if you build for iOS
cd ios && pod install
```

### Android setup

1. Ensure the Android SDK, JDK 17+, and an emulator or device are configured.
2. Let Android Studio perform a Gradle sync once so the C++ toolchain is ready.
3. Start the Metro bundler and run the demo:
   ```bash
   npm start
   npm run android
   ```

### iOS setup

1. Install Xcode with the Command Line Tools enabled.
2. Install CocoaPods dependencies:
   ```bash
   npx pod-install ios
   ```
3. Launch the demo application:
   ```bash
   npm start
   npm run ios
   ```

## Understanding the demo (`App.tsx`)

The demo is intentionally small so you can quickly map concepts to code. Below is a guided tour of the
key pieces inside [`App.tsx`](./App.tsx):

1. **Initialization** – when the component mounts, ThreadForge spins up four worker threads and starts
   emitting progress updates. The helpers `counterRef` and `statsRef` keep the UI live while background
   work runs.
   ```ts
   useEffect(() => {
     threadForge.initialize(4);
     progressSub.current = threadForge.onProgress((taskId, value) => {
       setProgress((prev) => ({ ...prev, [taskId]: value }));
     });
   }, []);
   ```
2. **Task builders** – utility functions such as `createHeavyMathTask`, `createTimerTask`,
   `createInstantMessageTask`, and the new SQLite helpers (`createSqliteHeavyOperationsTask` plus
   `createSqliteOrderBatchTask`) wrap the actual work. Each helper attaches a `__threadforgeSource`
   string so the same function also works in release builds where Hermes strips source code.
3. **Scheduling work** – the shared `runBackgroundTask` helper adds an entry to the task list, runs the
   function on the native pool via `threadForge.runFunction`, and updates UI state when the promise
   resolves. Cancelling simply calls `threadForge.cancelTask(id)`.
4. **UI state** – a scroll view renders buttons for each demo job plus a task list that shows status,
   latest progress, and the formatted result returned from native.

Skimming these sections in the file should make the flow of data crystal clear. Because everything is
ordinary React state, you can copy the patterns directly into your own screens.

### Minimal usage example

Initialize ThreadForge when your app boots, then schedule work from any component.

```tsx
useEffect(() => {
  const subscription = threadForge.onProgress((taskId, progress) => {
    if (taskId === 'prime-job') {
      setProgress(progress);
    }
  });

  return () => subscription.remove();
}, []);
```

### Cancel, inspect stats, and shut down

```ts
await threadForge.cancelTask('prime-job');
const stats = await threadForge.getStats();
await threadForge.shutdown();
```

---

## 4. Ready-to-copy component examples

### Simple "Crunch Numbers" button

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import { Button, Text, View } from 'react-native';
import { threadForge } from 'react-native-threadforge';

export function CrunchNumbers() {
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    threadForge.initialize(2);
    const sub = threadForge.onProgress((taskId, value) => {
      if (taskId === 'heavy-math') {
        setProgress(value);
      }
    });
    return () => {
      sub.remove();
      threadForge.shutdown();
    };
  }, []);

  const runTask = useCallback(async () => {
    setRunning(true);
    try {
      const task = () => {
        let total = 0;
        for (let i = 0; i < 5_000_000; i++) {
          total += Math.sqrt(i);
          if (i % 200_000 === 0) {
            reportProgress(i / 5_000_000);
          }
        }
        reportProgress(1);
        return total.toFixed(2);
      };
      Object.defineProperty(task, '__threadforgeSource', { value: task.toString() });
      const output = await threadForge.runFunction('heavy-math', task);
      setResult(output);
    } finally {
      setRunning(false);
    }
  }, []);

  return (
    <View>
      <Button title={running ? 'Working…' : 'Crunch numbers'} onPress={runTask} disabled={running} />
      <Text>Progress: {(progress * 100).toFixed(0)}%</Text>
      <Text>Result: {result ?? '—'}</Text>
    </View>
  );
}
```

### Parallel queue with cancellation

```tsx
const taskIds = ['batch-1', 'batch-2', 'batch-3'];

useEffect(() => {
  threadForge.initialize(3);
  return () => {
    taskIds.forEach((id) => threadForge.cancelTask(id));
    threadForge.shutdown();
  };
}, []);

const startBatch = () => {
  taskIds.forEach((id) => {
    threadForge.runFunction(id, () => {
      for (let i = 0; i < 7_000_000; i++) {
        if (i % 250_000 === 0) {
          reportProgress(i / 7_000_000);
        }
      }
      reportProgress(1);
      return `${id} done`;
    });
  });
};

const cancelAll = () => {
  taskIds.forEach((id) => threadForge.cancelTask(id));
};
```

---

## 5. Troubleshooting checklist

## SQLite bulk insert demo

Tap **Open SQLite Bulk Insert Demo** in the home screen to navigate to a dedicated walkthrough that
combines ThreadForge workers with [`react-native-sqlite-storage`](https://github.com/andpor/react-native-sqlite-storage).
The screen generates batches of synthetic order rows on a background thread via
`createSqliteOrderBatchTask`, then uses the native SQLite bridge to insert 10,000 records in chunks of
500 before querying summary metrics. This mirrors a real-world workflow where the heavy data shaping is
isolated from the UI thread while native SQL handles persistence and analytics.

## License

---

## 6. Want more detail?

- The [package README](./packages/react-native-threadforge/README.md) focuses on library usage.
- [`PUBLISHING.md`](./PUBLISHING.md) explains how to release the package to npm.
- [`__tests__/`](./__tests__) contains Jest tests that exercise the background task helpers.

Happy threading!
