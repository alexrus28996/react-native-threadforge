# ThreadForge React Native Showcase

ThreadForge is a React Native learning project that proves how to push CPU-heavy
JavaScript work onto background threads without blocking the UI. The
repository bundles two pieces side by side:

- **Demo application (`src/`)** – a React Native UI that lets you initialize the
  worker pool, launch multiple sample jobs, watch live progress, cancel work,
  and inspect pool statistics.
- **`react-native-threadforge` native module (`packages/react-native-threadforge/`)** –
  a cross-platform bridge that serializes JavaScript functions, executes them on
  native worker threads, and streams results back to React Native.

The project is built and maintained by **Abhishek Kumar**
([LinkedIn](https://www.linkedin.com/in/i-am-abhishek-kumar/)).

---

## Highlights at a glance

| Capability | Where to look |
| --- | --- |
| Threaded task execution with cancellation and priorities | [`packages/react-native-threadforge/src/index.ts`](./packages/react-native-threadforge/src/index.ts) |
| Live progress updates delivered over the React Native event emitter | [`ThreadForgeModule.kt`](./packages/react-native-threadforge/android/src/main/java/com/threadforge/ThreadForgeModule.kt), [`ThreadForge.mm`](./packages/react-native-threadforge/ios/ThreadForge.mm) |
| Configurable defaults loaded from environment variables | [`packages/react-native-threadforge/src/config.ts`](./packages/react-native-threadforge/src/config.ts) |
| Demo task factories with pre-serialized sources for release builds | [`src/tasks`](./src/tasks) |
| Reusable alert helper and status tracking UI | [`src/utils/showAlert.ts`](./src/utils/showAlert.ts), [`src/App.tsx`](./src/App.tsx) |

---

## Run the demo locally

```bash
# Install JavaScript dependencies
npm install

# Start Metro
npm start

# In a second terminal, choose a platform target
npm run ios     # Requires Xcode + an iOS simulator
npm run android # Requires Android Studio + an emulator or device
```

The native module expects Hermes to be enabled on both platforms. Android builds
already ship with `hermesEnabled=true` in
[`android/gradle.properties`](./android/gradle.properties). For iOS, `use_hermes!`
is set in [`ios/Podfile`](./ios/Podfile).

To run Jest or ESLint checks:

```bash
npm test
npm run lint
```

---

## Guided tour of the demo

The UI defined in [`src/App.tsx`](./src/App.tsx) wires a handful of buttons to
serializable task factories. Each task relies on the `ThreadTask` helper from
[`src/tasks/threadHelpers.ts`](./src/tasks/threadHelpers.ts) so the original
function source is always available after Hermes bytecode stripping.

| Task | Implementation | What it showcases |
| --- | --- | --- |
| Heavy math | [`src/tasks/heavyMath.ts`](./src/tasks/heavyMath.ts) | Iterative square roots with throttled `reportProgress` calls. |
| Timer | [`src/tasks/timer.ts`](./src/tasks/timer.ts) | A cancellable delay that reports completion status. |
| Instant message | [`src/tasks/instantMessage.ts`](./src/tasks/instantMessage.ts) | Returns a formatted string immediately to show minimal overhead. |
| Image-style processing | [`src/tasks/imageProcessing.ts`](./src/tasks/imageProcessing.ts) | CPU-bound trigonometry simulating pixel work. |
| Analytics aggregation | [`src/tasks/analytics.ts`](./src/tasks/analytics.ts) | Batches mock events and formats a summary. |

The demo also exposes a "Run four in parallel" button that launches several
heavy math jobs simultaneously and a "Cancel latest" affordance powered by
`threadForge.cancelTask`.

---

## Native architecture overview

| Layer | Responsibilities |
| --- | --- |
| **JavaScript** | `ThreadForgeEngine` validates input, serializes worklet functions, dispatches to native, and parses structured responses. |
| **Android (Kotlin + JNI)** | [`ThreadForgeModule.kt`](./packages/react-native-threadforge/android/src/main/java/com/threadforge/ThreadForgeModule.kt) ensures Hermes is present, calls into the shared C++ worker pool, and emits progress through `RCTDeviceEventEmitter`. |
| **iOS (Objective-C++)** | [`ThreadForge.mm`](./packages/react-native-threadforge/ios/ThreadForge.mm) mirrors the Android bridge using GCD queues and shared C++ helpers. |
| **Shared C++ core** | [`cpp/`](./packages/react-native-threadforge/cpp) hosts the `ThreadPool`, `FunctionExecutor`, and JSON helpers that run tasks and package results. |

Both native modules expose the same methods (`initialize`, `runFunction`,
`cancelTask`, `getStats`, `shutdown`) so the JavaScript layer can remain
platform-agnostic.

---

## Repository structure

```
├─ App.tsx                        # Delegates to the demo app under src/
├─ src/                           # React Native UI, task factories, utilities
├─ packages/react-native-threadforge/
│  ├─ android/                    # Android bridge and JNI bindings
│  ├─ ios/                        # iOS bridge
│  ├─ cpp/                        # Shared thread pool implementation
│  └─ src/                        # TypeScript API surface
├─ docs/                          # Supplementary documentation assets
└─ __tests__/                     # Jest tests for the demo helpers
```

---

## Creator

- **Name:** Abhishek Kumar
- **LinkedIn:** <https://www.linkedin.com/in/i-am-abhishek-kumar/>

Feel free to reach out with feedback, ideas, or questions about the project.
