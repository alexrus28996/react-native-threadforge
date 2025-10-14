# ThreadForge

ThreadForge is a handcrafted React Native showcase application and library that proves how to offload
CPU-intensive workloads into a native C++ thread pool while keeping the JavaScript and UI threads
responsive. The repository contains a demo app plus the publishable `react-native-threadforge` package,
crafted and maintained by Abhishek Kumar.

## Overview

ThreadForge delivers a native worker pool that integrates tightly with React Native. It provides JSON
based task descriptors, prioritized execution, throttled progress events, and a registry for custom
native jobs. Use the demo app to explore the APIs and verify performance characteristics before
shipping the library in your own application.

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

## Usage

Initialize ThreadForge when your app boots, then schedule work from any component.

```tsx
import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { threadForge, TaskPriority, DEFAULT_PROGRESS_THROTTLE_MS } from 'react-native-threadforge';

export function PrimeSearch() {
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    let subscription: ReturnType<typeof threadForge.on> | null = null;

    async function bootstrap() {
      await threadForge.initialize(4);
      subscription = threadForge.on('progress', ({ taskId, progress }) => {
        if (isMounted && taskId === 'prime-search') {
          setProgress(progress);
        }
      });

      const payload = { type: 'HEAVY_LOOP', iterations: 1_000_000 } as const;
      const output = await threadForge.runTask('prime-search', payload, TaskPriority.HIGH);
      if (isMounted) {
        setResult(output);
      }
    }

    bootstrap();

    return () => {
      isMounted = false;
      subscription?.remove();
      threadForge.shutdown();
    };
  }, []);

  return (
    <View>
      <Text>Prime search progress: {(progress * 100).toFixed(1)}%</Text>
      <Text>Updates every {DEFAULT_PROGRESS_THROTTLE_MS}ms from native code.</Text>
      {result ? <Text>Result: {result}</Text> : null}
    </View>
  );
}
```

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

