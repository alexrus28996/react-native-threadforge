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

  const result = await threadForge.runTask('heavy-task', {
    type: 'HEAVY_LOOP',
    iterations: 500_000,
  }, TaskPriority.HIGH);

  console.log(result);
}
```

Refer to the sample application in this repository for more advanced usage examples.
