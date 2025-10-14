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

Task descriptors are now serialized using JSON under the hood. This means you can pass native
JavaScript objects directly to the `runTask` helper and the native layer will validate and parse the
payload, while still accepting legacy string-encoded descriptors for backwards compatibility.

Refer to the sample application in this repository for more advanced usage examples.
