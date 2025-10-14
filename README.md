# ThreadForge Demo Application

ThreadForge is a React Native showcase that demonstrates how to execute heavy native
workloads without blocking the JavaScript thread or the UI. It uses a custom native
module backed by a C++ thread pool to schedule background jobs while keeping the
foreground experience responsive.

This repository contains both the sample application (in the project root) and the
`react-native-threadforge` package (under `packages/`). The package exposes a typed
JavaScript API and bridges into native Android code via the JNI layer implemented in
C++.

## Features

- 🔧 Configurable native thread pool used for all heavy computation.
- 🔁 Queued tasks with priorities (low, normal, high).
- 📊 Live stats for active, pending, and allocated worker threads.
- 🧵 Sample UI with long-running simulations to prove the UI stays responsive while
  background jobs run in parallel.

## Prerequisites

Make sure you have completed the official
[React Native Environment Setup](https://reactnative.dev/docs/environment-setup)
before continuing. You need Node.js 18+, the Android/iOS build tooling, and either an
emulator or a device connected to your machine.

## Installing Dependencies

From the project root install JavaScript dependencies:

```bash
npm install
```

If you are developing on Android, also install the native dependencies by opening the
`android` directory in Android Studio once so that Gradle can sync the C++ build.

## Running the App

Open two terminals from the project root:

1. **Start Metro (JavaScript bundler)**
   ```bash
   npm start
   ```
2. **Launch the native application**
   ```bash
   # Android
   npm run android

   # iOS
   npm run ios
   ```

The UI contains several buttons that enqueue heavy work. Observe that the "UI Counter"
keeps incrementing smoothly while the background tasks are running.

## How It Works

- The JavaScript API lives in `packages/react-native-threadforge/src/index.ts` and
  serializes task descriptors before sending them over the native bridge.
- On Android, the `ThreadForgeModule` Kotlin class manages a cached executor that calls
  into the JNI bindings exposed by `ThreadForgeJNI.cpp`.
- The JNI layer forwards the work to a C++ `ThreadPool` implementation that schedules
  tasks onto worker threads based on priority, keeping the UI thread free.

## Troubleshooting

If you encounter `UnsatisfiedLinkError` messages about missing `native*` functions,
run a clean rebuild of the Android project so the native library is recompiled:

```bash
cd android
./gradlew clean
cd ..
npm run android
```

For other build issues consult the React Native
[Troubleshooting guide](https://reactnative.dev/docs/troubleshooting).

## Contributing

Pull requests are welcome! Please open an issue first to discuss what you would like to
change.

## License

MIT
