# ThreadForge

ThreadForge is a production-ready React Native module that demonstrates how to offload
CPU intensive work onto a native C++ thread pool without blocking the JavaScript or
main UI threads. This repository doubles as a showcase application and the source for
the `react-native-threadforge` npm package.

## Table of Contents
- [Overview](#overview)
- [Applications](#applications)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Running the Demo Application](#running-the-demo-application)
  - [Android](#android)
  - [iOS](#ios)
- [Using the Library in Your Project](#using-the-library-in-your-project)
  - [1. Install the Package](#1-install-the-package)
  - [2. Configure Native Projects](#2-configure-native-projects)
  - [3. Initialize ThreadForge](#3-initialize-threadforge)
- [API Quick Start](#api-quick-start)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

## Overview

The sample app and the library showcase how to:

- Create a configurable native thread pool used for heavy computation.
- Dispatch prioritized jobs from JavaScript without blocking rendering.
- Pause, resume, and cancel long-running native tasks directly from JS.
- Inspect real-time statistics about the background worker pool.

## Applications

ThreadForge is ideal whenever you need to keep your React Native interface smooth
while offloading heavy workloads such as:

- Generating reports or processing large JSON payloads.
- Running simulations, cryptographic tasks, or scientific calculations.
- Coordinating file compression, decompression, or media transcoding.
- Any work that would normally freeze the JS thread if executed in pure JavaScript.

## Prerequisites

Before you begin, make sure your environment satisfies the
[official React Native requirements](https://reactnative.dev/docs/environment-setup):

- Node.js 18 or newer.
- Java Development Kit (JDK 17+) and Android Studio (for Android builds).
- Xcode with Command Line Tools (for iOS builds).
- A simulator/emulator or a physical device connected to your machine.

## Installation

Clone the repository and install JavaScript dependencies in the project root:

```bash
npm install
```

If you open the Android project in Android Studio, allow Gradle to sync once so that
the C++ toolchain is configured for the native module.

## Running the Demo Application

The repository includes a demo showcasing how ThreadForge keeps the UI responsive even
while running CPU-intensive jobs.

Start the Metro bundler from the project root:

```bash
npm start
```

### Android

In another terminal window, build and run the Android app:

```bash
npm run android
```

- Ensure an Android emulator is running or a device is connected via USB.
- Gradle will compile the Kotlin bridge and the C++ thread pool on first run.

### iOS

Install CocoaPods dependencies (only needed after cloning or when native code
changes):

```bash
npx pod-install ios
```

Then launch the iOS app:

```bash
npm run ios
```

- Provide an iOS simulator name with `--simulator` if you want a specific device.
- Xcode will compile the Swift bridge and the C++ sources into a dynamic library.

Once the app is running, tap any of the workload buttons in the UI. The counter in the
header should continue to increment smoothly, demonstrating that the JS thread remains
free while native workers handle the heavy tasks.

## Using the Library in Your Project

ThreadForge is distributed as a standalone npm package. Follow these steps to add it to
an existing React Native application.

### 1. Install the Package

With npm:

```bash
npm install react-native-threadforge
```

Or with Yarn:

```bash
yarn add react-native-threadforge
```

### 2. Configure Native Projects

**Android**

1. Sync the project with Gradle (Android Studio does this automatically).
2. Ensure `minSdkVersion` is at least 21 (default for modern React Native apps).
3. No additional manual linking is required because the module uses autolinking.

**iOS**

1. Navigate to your iOS folder and install pods:
   ```bash
   cd ios
   pod install
   cd ..
   ```
2. Open the generated `.xcworkspace` in Xcode if you prefer to build from the IDE.

### 3. Initialize ThreadForge

ThreadForge needs to be initialized before scheduling work. A common pattern is to
initialize it when your app launches and tear it down when the app closes.

```ts
import { useEffect } from 'react';
import { threadForge } from 'react-native-threadforge';

export function useThreadForge(poolSize = 4) {
  useEffect(() => {
    threadForge.initialize(poolSize);

    return () => {
      threadForge.shutdown();
    };
  }, [poolSize]);
}
```

Call `useThreadForge()` near the root of your component tree and the pool will be ready
for any components that want to schedule work.

## API Quick Start

```ts
import { threadForge, TaskPriority } from 'react-native-threadforge';

await threadForge.initialize(6);

// Fire and await a heavy task
const result = await threadForge.runTask('prime-search', {
  type: 'HEAVY_LOOP',
  iterations: 1_000_000,
}, TaskPriority.HIGH);

// Temporarily pause execution (pending work stays in the queue)
await threadForge.pause();

// Cancel an in-flight task if the user navigates away
await threadForge.cancelTask('prime-search');

// Resume the queue when it is safe to continue
await threadForge.resume();

// Inspect how the pool is doing
const stats = await threadForge.getStats();

await threadForge.shutdown();
```

Every helper returns a Promise so the APIs integrate cleanly with hooks, sagas,
async/await flows, or any other async control structure you prefer.

## Troubleshooting

If you encounter `UnsatisfiedLinkError` messages about missing native functions, run a
clean rebuild of the Android project so the native library is recompiled:

```bash
cd android
./gradlew clean
cd ..
npm run android
```

For iOS build failures, open the workspace in Xcode and run Product → Clean Build
Folder before retrying. You can also run `xcodebuild -workspace ios/ThreadForge.xcworkspace -scheme ThreadForge -configuration Debug clean build` for a fully scriptable
clean build.

Refer to the official React Native [Troubleshooting guide](https://reactnative.dev/docs/troubleshooting)
for platform-specific advice.

## Contributing

Pull requests are welcome! Please open an issue first to discuss what you would like to
change or improve.

## License

MIT
