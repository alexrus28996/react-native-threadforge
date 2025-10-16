# ThreadForge

ThreadForge is a handcrafted React Native showcase application and library that proves how to offload
CPU-intensive workloads into a native C++ thread pool while keeping the JavaScript and UI threads
responsive. The repository contains a demo app plus the publishable `react-native-threadforge` package,
crafted and maintained by Abhishek Kumar.

If you are here to understand how the demo works, start with [`App.tsx`](./App.tsx). The component is
fully annotated in this README so you can follow how background workers are created, how progress is
reported, and how results flow back to the UI.

## Overview

ThreadForge delivers a native worker pool that integrates tightly with React Native. It provides JSON
based task descriptors, prioritized execution, throttled progress events, and a registry for custom
native jobs. Use the demo app to explore the APIs and verify performance characteristics before
shipping the library in your own application.

## Quick start

1. **Install dependencies**
   ```bash
   npm install
   ```
2. **Run the metro bundler**
   ```bash
   npm start
   ```
3. **Launch the demo application**
   ```bash
   npm run android   # or npm run ios
   ```

The first run may take a few minutes while the native C++ thread pool is compiled.

## Features

- **Native C++ worker pool** with dynamic sizing that keeps heavy computations off the JS thread.
- **Task priority queue** so latency-sensitive jobs can jump ahead of background work.
- **Custom task registry** defined in JSON, enabling complex native pipelines without recompilation.
- **Progress events with native throttling** delivered uniformly across Android and iOS.
- **Queue management utilities** that expose concurrency controls, queue limits, and runtime stats.

## Installation

Clone the repository and install dependencies in the root directory:

```bash
npm install
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
2. **Task builders** – utility functions such as `createHeavyFunction`, `createTimingFunction`, and
   `createMessageFunction` wrap the actual work. Each helper attaches a `__threadforgeSource` string so
   the same function also works in release builds where Hermes strips source code.
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
import React, { useEffect, useState } from 'react';
import { View, Text, Button } from 'react-native';
import { threadForge } from 'react-native-threadforge';

export function BackgroundSum() {
  const [result, setResult] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    threadForge.initialize(2);
    const subscription = threadForge.onProgress((taskId, value) => {
      if (taskId === 'sum-task') {
        setProgress(value);
      }
    });
    return () => {
      subscription.remove();
      threadForge.shutdown();
    };
  }, []);

  const runJob = async () => {
    const job = () => {
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

    Object.defineProperty(job, '__threadforgeSource', {
      value: job.toString(),
    });

    const output = await threadForge.runFunction('sum-task', job);
    setResult(output);
  };

  return (
    <View>
      <Button title="Crunch numbers" onPress={runJob} />
      <Text>Progress: {(progress * 100).toFixed(0)}%</Text>
      <Text>Result: {result ?? '—'}</Text>
    </View>
  );
}
```

`reportProgress` is provided globally by ThreadForge inside background runtimes. Call it to emit
throttled updates to your React components.

Register complex native pipelines with JSON descriptors and execute them without recompiling your
bridges. Runtime helpers expose pause, resume, cancellation, concurrency, and queue limit controls,
making it simple to adapt to changing workloads.

## Running the Demo Application

Start Metro with `npm start`, then run `npm run android` or `npm run ios` depending on your platform.
The counter at the top of the demo continues incrementing smoothly even while native workers crunch on
heavy tasks, illustrating the responsiveness gains provided by ThreadForge.

## Library Comparison

| Capability | ThreadForge | react-native-threads | react-native-multithreading |
| --- | --- | --- | --- |
| Native C++ worker pool | ✅ (dynamic sizing) | ❌ (spawns JS runtimes) | ✅ (fixed workers) |
| JSON task descriptors | ✅ | ❌ | ❌ |
| Dynamic registry of native tasks | ✅ | ❌ | ⚠️ (requires rebuild) |
| Native progress events (10 Hz throttle) | ✅ | ❌ | ⚠️ (manual) |
| Pause/Resume & queue limits | ✅ | ❌ | ⚠️ (partial) |
| iOS + Android parity | ✅ | ⚠️ (limited iOS support) | ✅ |
| Works with Hermes | ✅ | ⚠️ (extra config) | ✅ |

## Troubleshooting

- **UnsatisfiedLinkError:** Run a clean Gradle build so the native shared library is rebuilt.
- **No progress events:** Confirm `threadForge.initialize` ran before subscribing and the bridge is still active.
- **iOS build issues:** Re-run `pod install` and clean the Xcode build folder before retrying.

## Contributing

Pull requests are welcome. Please open an issue to discuss ideas before submitting significant changes.

## License

MIT

## Author

ThreadForge is created and maintained by **Abhishek Kumar (alexrus28996)**. Feel free to reach out at
alexrus28996@gmail.com for collaboration or support enquiries.

