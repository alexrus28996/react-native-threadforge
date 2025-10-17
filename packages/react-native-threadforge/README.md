# react-native-threadforge

`react-native-threadforge` is a lightweight native module that executes
serializable JavaScript functions on background threads powered by a shared C++
worker pool. It is designed for React Native apps that need to run CPU-intensive
work without blocking the main UI thread.

This package is authored by **Abhishek Kumar**
([LinkedIn](https://www.linkedin.com/in/i-am-abhishek-kumar/)).

---

## Getting started

Install the package from npm (or reference it locally as this repository does):

```bash
npm install react-native-threadforge
# or
yarn add react-native-threadforge
```

If you are consuming the module straight from this monorepo, the demo app links
it through `"react-native-threadforge": "file:packages/react-native-threadforge"`.

Then install native dependencies:

```bash
npx pod-install
```

### Requirements

- React Native **0.70+**
- Hermes enabled on Android (`hermesEnabled=true` in `android/gradle.properties`)
  and iOS (`use_hermes!` in `ios/Podfile`)
- Android Studio / Xcode for building native code

The module automatically loads its native library on both platforms and will
throw descriptive errors if Hermes is missing.

---

## Quick usage

```tsx
import {
  threadForge,
  TaskPriority,
  ThreadForgeCancelledError,
} from 'react-native-threadforge';

await threadForge.initialize();

const subscription = threadForge.onProgress((taskId, value) => {
  console.log('progress', taskId, value);
});

try {
  const summary = await threadForge.runFunction(
    'analytics-job-1',
    () => {
      const points = Array.from({ length: 1_000 }, (_, index) => Math.sin(index));
      const total = points.reduce((acc, value) => acc + value, 0);
      globalThis.reportProgress?.(1);
      return { total };
    },
    TaskPriority.HIGH,
  );
  console.log('Result', summary);
} catch (error) {
  if (error instanceof ThreadForgeCancelledError) {
    console.log('Task cancelled');
  }
}

subscription.remove();
await threadForge.shutdown();
```

Worklet functions must be self-contained so they can be serialized to strings.
For release builds with Hermes bytecode, provide a manual source override (see
[`src/tasks/threadHelpers.ts`](../../src/tasks/threadHelpers.ts) for an example).

---

## API reference

### `threadForge.initialize(threadCount?, options?)`
Initializes the native worker pool. `threadCount` defaults to
`DEFAULT_THREAD_COUNT` (4 unless overridden by environment variables). Provide
`options.progressThrottleMs` to control how often progress events are emitted
from native to JavaScript.

### `threadForge.runFunction(id, worklet, priority?)`
Runs a serializable `worklet` on a background thread. Returns a `Promise<T>` with
the worklet result. Throws an error if serialization fails or the native layer
returns a failure. Passing an invalid `id` or function triggers validation
errors before native code is executed.

### `threadForge.onProgress(listener)`
Registers a callback invoked with `(taskId, progress)` values between 0 and 1.
Returns an `EmitterSubscription`; call `.remove()` when finished.

### `threadForge.cancelTask(id)`
Attempts to cancel a task currently queued or running. Resolves to `true` if the
native layer acknowledged the cancellation request.

### `threadForge.getStats()`
Retrieves the latest thread pool statistics `{ threadCount, pending, active }`.
The method parses JSON strings returned by the native side for compatibility
with both platforms.

### `threadForge.shutdown()`
Stops the worker pool and unsubscribes native progress emitters. Safe to call
multiple times.

### `threadForge.isInitialized()`
Returns `true` after `initialize` completes and `false` after `shutdown`.

### `ThreadForgeCancelledError`
Custom error subclass thrown when the native layer reports a cancelled task.

### `TaskPriority`
Enum exported with `LOW`, `NORMAL`, and `HIGH`. The native bridges clamp incoming
values to this range.

### `DEFAULT_THREAD_COUNT`, `DEFAULT_PROGRESS_THROTTLE_MS`, `threadForgeConfig`
Configuration helpers sourced from [`src/config.ts`](./src/config.ts). Override
via environment variables (`THREADFORGE_DEFAULT_THREAD_COUNT` and
`THREADFORGE_PROGRESS_THROTTLE_MS`).

---

## Native implementation overview

- **Android:** [`ThreadForgeModule.kt`](./android/src/main/java/com/threadforge/ThreadForgeModule.kt)
  validates Hermes, marshals requests onto a cached thread pool, and communicates
  with the shared C++ worker pool via JNI bindings in [`cpp/`](./cpp).
- **iOS:** [`ThreadForge.mm`](./ios/ThreadForge.mm) mirrors the Android bridge
  using Grand Central Dispatch and the same C++ helpers.
- **Shared C++:** [`ThreadPool.cpp`](./cpp/ThreadPool.cpp),
  [`FunctionExecutor.cpp`](./cpp/FunctionExecutor.cpp), and
  [`TaskResult.cpp`](./cpp/TaskResult.cpp) run serialized worklets, manage
  cancellations, and encode results as JSON.

---

## Testing and linting

This package ships with Jest unit tests that exercise the JavaScript facade:

```bash
cd packages/react-native-threadforge
npm test
```

TypeScript and ESLint configs are included for additional validation:

```bash
npm run typescript
npm run lint
```

---

## Changelog & licensing

- Changes are tracked in [`CHANGELOG.md`](./CHANGELOG.md).
- Distributed under the [MIT License](../../LICENSE).
