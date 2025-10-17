# 🚀 ThreadForge React Native Showcase

<p align="center">
  <img src="./docs/assets/threadforge-logo.png" alt="ThreadForge logo" width="380" />
</p>

**ThreadForge** is a high-performance React Native learning project demonstrating how to push CPU-intensive JavaScript tasks to background threads—without blocking the UI. It consists of:

- 🎛️ **Demo App (`src/`)** – An interactive React Native UI to initialize the thread pool, launch and cancel sample tasks, track live progress, and inspect stats.
- 🧩 **ThreadForge Native Module (`packages/react-native-threadforge/`)** – A reusable cross-platform engine that serializes JS functions, executes them in a C++ worker pool, and streams updates/results to JS.

> Built and maintained by [**Abhishek Kumar**](https://www.linkedin.com/in/i-am-abhishek-kumar/)

---

## ✨ Highlights at a Glance

| Feature | File/Location |
|--------|----------------|
| 🔁 Threaded task execution with cancellation and priority | [`src/index.ts`](./packages/react-native-threadforge/src/index.ts) |
| 📡 Real-time progress updates via event emitters | [`ThreadForgeModule.kt`](./packages/react-native-threadforge/android/...), [`ThreadForge.mm`](./packages/react-native-threadforge/ios/...) |
| ⚙️ Configurable defaults via env vars | [`config.ts`](./packages/react-native-threadforge/src/config.ts) |
| 🔒 Pre-serialized sources for Hermes compatibility | [`src/tasks`](./src/tasks) |
| 🧠 UI helpers and alerting | [`showAlert.ts`](./src/utils/showAlert.ts), [`App.tsx`](./src/App.tsx) |

---

## 🧪 Try the Demo Locally

```bash
# Install dependencies
npm install

# Start Metro bundler
npm start

# In another terminal:
npm run ios     # Requires Xcode + iOS Simulator
npm run android # Requires Android Studio + Emulator/device
```

⚠️ **Hermes is required**:
- ✅ Android: `hermesEnabled=true` (already set in [`android/gradle.properties`](./android/gradle.properties))
- ✅ iOS: `use_hermes!` enabled in [`ios/Podfile`](./ios/Podfile)

Run tests and lint checks:
```bash
npm test
npm run lint
```

---

## 🔍 Demo Task Gallery

UI logic lives in [`App.tsx`](./src/App.tsx) and wires to serializable factories using `ThreadTask` wrappers. This ensures the function body survives Hermes bytecode stripping.

| Task | File | Purpose |
|------|------|---------|
| 📐 Heavy Math | [`heavyMath.ts`](./src/tasks/heavyMath.ts) | Square root calculations with progress emission |
| ⏲️ Timer | [`timer.ts`](./src/tasks/timer.ts) | Delay-based task with cancelation support |
| 💬 Instant Message | [`instantMessage.ts`](./src/tasks/instantMessage.ts) | Lightweight task with instant return |
| 🖼️ Image Simulation | [`imageProcessing.ts`](./src/tasks/imageProcessing.ts) | Simulated pixel computation |
| 📊 Analytics | [`analytics.ts`](./src/tasks/analytics.ts) | Batch process fake events and return a summary |

🔄 **Bonus:** Run multiple jobs in parallel or cancel them interactively with built-in buttons!

---

## 🏗️ Native Architecture

| Layer | Responsibilities |
|-------|------------------|
| **JavaScript (TS)** | Input validation, task serialization, native communication, and result parsing |
| **Android (Kotlin + JNI)** | Calls into C++ pool, ensures Hermes is live, and emits progress events |
| **iOS (Objective-C++)** | GCD-based worker bridge, forwards events using RN emitter |
| **C++ Core** | Owns `ThreadPool`, `FunctionExecutor`, JSON serialization of results/errors |

🔁 Both platforms expose a unified API: `initialize`, `runFunction`, `cancelTask`, `getStats`, and `shutdown`

---

## 🗂️ Repository Structure

```
├─ App.tsx                        # Entrypoint to the demo app
├─ src/                           # Demo UI, task factories, utilities
├─ packages/
│  └─ react-native-threadforge/
│     ├─ android/                 # Android bridge (Kotlin + JNI)
│     ├─ ios/                     # iOS native module (Obj-C++)
│     ├─ cpp/                     # Cross-platform C++ core logic
│     └─ src/                     # TypeScript interface and public API
├─ docs/                          # Images and documentation assets
└─ __tests__/                     # Jest unit tests for helpers
```

---

## 👨‍💻 Author

- **Abhishek Kumar**  
  [LinkedIn ↗](https://www.linkedin.com/in/i-am-abhishek-kumar/)

Feel free to reach out with feedback, ideas, or questions.

---

## 💡 Tips & Best Practices

- ✅ Always call `shutdown()` after task execution to clean up resources
- 🔍 Use `getStats()` to monitor thread pool state and task load
- 🔧 Use `progressThrottleMs` to reduce bridge overhead for rapid updates
- 📤 Use `__threadforgeSource` in release mode to ensure function source isn't stripped
- 🧼 Keep your worklet functions pure and free from closures or external references

---

Enjoy hacking with background threads in React Native 🎉