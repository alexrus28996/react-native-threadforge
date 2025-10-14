# React Native ThreadForge

React Native ThreadForge is a cross-platform native module that exposes a high-performance C++
thread pool to JavaScript. It allows you to schedule CPU intensive workloads without blocking the UI
thread on both Android and iOS.

## Installation

```sh
npm install react-native-threadforge
# or
yarn add react-native-threadforge
```

### iOS

1. Install pods:
   ```sh
   cd ios && pod install
   ```
2. Rebuild the iOS application.

### Android

No additional steps are required beyond rebuilding the Android application.

## Usage

```ts
import { threadForge, TaskPriority } from 'react-native-threadforge';

async function bootstrap() {
  await threadForge.initialize(4);

  const subscription = threadForge.on('progress', ({ taskId, progress }) => {
    console.log(`[${taskId}] progress`, Math.round(progress * 100));
  });

  const result = await threadForge.runTask({
    type: 'HEAVY_LOOP',
    iterations: 500_000,
  }, { priority: TaskPriority.HIGH });

  console.log(result);
  subscription.remove();
}

bootstrap();
```

You can also register bespoke workloads that run entirely inside the native thread pool by providing
a declarative descriptor:

```ts
await threadForge.registerTask('matrixPipeline', {
  steps: [
    { type: 'HEAVY_LOOP', iterations: { fromPayload: 'warmupIterations', default: 100_000 } },
    { type: 'TIMED_LOOP', durationMs: { fromPayload: 'durationMs', default: 500 } },
    { type: 'INSTANT_MESSAGE', message: 'All phases complete' },
  ],
});

const summary = await threadForge.runTask('matrixPipeline', {
  warmupIterations: 250_000,
  durationMs: 750,
});

console.log(JSON.parse(summary));
```

The native layer validates every descriptor using JSON and provides detailed error messages when a
payload does not match the expected schema. Legacy pipe-delimited descriptors remain supported for
backwards compatibility.

Refer to the sample application in this repository for more advanced usage examples.
