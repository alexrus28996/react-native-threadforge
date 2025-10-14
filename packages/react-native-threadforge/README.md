# React Native ThreadForge

> **Author:** Abhishek Kumar (alexrus28996)

ThreadForge brings a modern, native C++ thread pool to React Native so you can offload CPU intensive
work without blocking the JavaScript bridge. The library is handcrafted and maintained by Abhishek
Kumar and now ships with JSON task descriptors,
a dynamic native registry for custom pipelines, built-in progress events (throttled natively on both
Android and iOS), and full support for the latest React Native releases.

## Installation

1. Install the package in your React Native workspace:
   ```sh
   npm install react-native-threadforge
   # or
   yarn add react-native-threadforge
   ```
2. iOS specific setup:
   ```sh
   cd ios
   pod install
   cd ..
   ```
3. Rebuild your native projects:
   ```sh
   # iOS
   npx react-native run-ios

   # Android
   npx react-native run-android
   ```

## Initialization & Lifecycle

ThreadForge is lazy by design—initialize it once when your app boots and shut it down when the runtime
is about to exit.

```ts
import threadForge from 'react-native-threadforge';

async function bootstrap() {
  await threadForge.initialize(4); // Spin up 4 worker threads

  // Optional: register any custom native tasks here (see below).
}

bootstrap();
```

You can check the current state and shut down explicitly when necessary:

```ts
if (threadForge.isInitialized()) {
  await threadForge.shutdown();
}
```

## Running Native Tasks

ThreadForge ships with native descriptors for common benchmarking and demonstration tasks. Each task is
defined with a JSON payload and executed with `runTask`.

```ts
import { TaskPriority } from 'react-native-threadforge';

const result = await threadForge.runTask(
  { type: 'HEAVY_LOOP', iterations: 250_000 },
  { priority: TaskPriority.HIGH },
);

console.log('Heavy loop summary:', result);
```

You can run previously registered native tasks (see below) using `runTask` with a string identifier or
call `runRegisteredTask` directly when you already have a task ID:

```ts
const jobId = `report-${Date.now()}`;
const summary = await threadForge.runRegisteredTask(jobId, 'reportingPipeline', { period: '30d' });
```

## Subscribing to Progress

All progress events are throttled in native code (default: 10 updates per second, exposed in JavaScript
as `DEFAULT_PROGRESS_THROTTLE_MS`). Events fire uniformly across Android and iOS.

```ts
import threadForge, { DEFAULT_PROGRESS_THROTTLE_MS } from 'react-native-threadforge';

const subscription = threadForge.on('progress', ({ taskId, progress }) => {
  console.log(`${taskId} :: ${(progress * 100).toFixed(1)}% (throttled every ${DEFAULT_PROGRESS_THROTTLE_MS}ms)`);
});

// Later…
subscription.remove();
```

## Registering Custom Tasks

ThreadForge understands declarative task graphs written in JSON. A task definition can reference values
from the payload at runtime and chain multiple native steps.

```ts
await threadForge.registerTask('reportingPipeline', {
  steps: [
    { type: 'HEAVY_LOOP', iterations: { fromPayload: 'warmupIterations', default: 150_000 } },
    { type: 'TIMED_LOOP', durationMs: { fromPayload: 'durationMs', default: 800 } },
    { type: 'INSTANT_MESSAGE', message: 'Reporting pipeline finished' },
  ],
});

const summary = await threadForge.runTask('reportingPipeline', {
  warmupIterations: 250_000,
  durationMs: 1_200,
});
```

Use `unregisterTask` to remove custom entries when they are no longer required.

## Managing Concurrency & Queue Limits

ThreadForge exposes runtime controls for the native thread pool:

```ts
await threadForge.setConcurrency(6); // Resize the pool (no pending work allowed)
await threadForge.setQueueLimit(20); // Limit queued tasks to prevent overload

const { threadCount, pendingTasks, activeTasks, queueLimit } = await threadForge.getStats();
console.log({ threadCount, pendingTasks, activeTasks, queueLimit });
```

## Pause, Resume, and Cancellation

You can suspend the worker pool, resume later, or cancel individual jobs.

```ts
await threadForge.pause();
// … tasks are paused …
await threadForge.resume();

const cancelled = await threadForge.cancelTask('expensive-job-id');
console.log('Cancelled?', cancelled);
```

## Example: Throttled Progress Bar

Below is a minimal React component that renders a progress bar fed by native events. Even for tasks with
millions of iterations, updates are limited to 10 per second, keeping the UI smooth.

```tsx
import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import threadForge from 'react-native-threadforge';

export function TaskProgressBar() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let subscription = threadForge.on('progress', ({ taskId, progress }) => {
      if (taskId === 'demo-task') {
        setProgress(progress);
      }
    });

    threadForge.runTask('demo-task', { type: 'TIMED_LOOP', durationMs: 5_000 });

    return () => subscription.remove();
  }, []);

  return (
    <View>
      <Text>Progress: {(progress * 100).toFixed(0)}%</Text>
      <View style={{ backgroundColor: '#eee', height: 12, borderRadius: 6 }}>
        <View
          style={{
            backgroundColor: '#4c6ef5',
            height: 12,
            borderRadius: 6,
            width: `${Math.round(progress * 100)}%`,
          }}
        />
      </View>
    </View>
  );
}
```

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

## Testing

The package ships with Jest utilities. You can extend the test suite or run the existing tests:

```sh
npm run test
```

## Troubleshooting

- **No events received:** Ensure `threadForge.initialize` ran before subscribing to progress.
- **Queue limit errors:** Increase the limit with `threadForge.setQueueLimit` or drain tasks faster by
  increasing concurrency.
- **iOS build errors:** Re-run `pod install` after upgrading the package so the C++ sources are recompiled.

## License

ThreadForge is released under the MIT License and lovingly maintained by Abhishek Kumar (alexrus28996).
