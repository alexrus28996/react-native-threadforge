# react-native-threadforge

<p align="center">
  <img src="../../docs/assets/threadforge-logo.png" alt="ThreadForge logo" width="440" />
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/react-native-threadforge"><img alt="npm" src="https://img.shields.io/badge/npm-private-orange?logo=npm" /></a>
  <a href="https://reactnative.dev"><img alt="React Native" src="https://img.shields.io/badge/React%20Native-0.73+-lightblue?logo=react" /></a>
  <a href="https://hermesengine.dev"><img alt="Hermes" src="https://img.shields.io/badge/Engine-Hermes-7a3cff?logo=react" /></a>
  <a href="../../LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/License-MIT-success" /></a>
</p>

> Elegant background work orchestration for React Native. Define serializable worklets in TypeScript, let ThreadForge schedule them across Hermes-backed worker pools, and ship fluid experiences—no native wizardry required.

---

## 🌟 Feature Snapshot

| Category | Highlights |
| --- | --- |
| 🚀 Performance | Multi-worker pools, priority-aware scheduling, configurable throttling, zero-jank handoffs. |
| 🧠 Developer Experience | First-class TypeScript, descriptive errors, hot-reload-friendly initialization, rich logging. |
| 🪝 Observability | Global lifecycle hooks, progress events, task timelines, pluggable reporters. |
| 🧯 Resilience | Cancellation tokens, automatic retries with backoff, guard rails for serialization mistakes. |

---

## 📦 Installation

```bash
npm install react-native-threadforge
# or
yarn add react-native-threadforge

npx pod-install   # iOS dependencies
```

**Prerequisites**

- Hermes enabled (`ios/Podfile`, `android/gradle.properties`)
- React Native 0.73+
- JDK 17+, Xcode 15+

Need extra setup? Check the [troubleshooting playbook](#-troubleshooting).

---

## ⚡️ Quick Usage

```tsx
import { threadForge, TaskPriority } from 'react-native-threadforge';

threadForge.initialize(4, {
  progressThrottleMs: 75,
  onError: (error, task) => console.warn('Task error', task.id, error),
});

const result = await threadForge.runTask({
  id: 'thumbnail-batch',
  priority: TaskPriority.High,
  metadata: { sourceCount: 24 },
  worklet() {
    const outputs: string[] = [];
    for (const image of payload.images) {
      outputs.push(transformImage(image));
      reportProgress(outputs.length / payload.images.length);
    }
    return outputs;
  },
  payload: { images: uriList },
});
```

### Task anatomy

| Field | Required? | Notes |
| --- | --- | --- |
| `id` | ✅ | Unique per task. Use for logging and deduping. |
| `worklet` | ✅ | Plain function. ThreadForge auto-injects `reportProgress` & `payload`. |
| `priority` | ⭕️ | `Low`, `Normal`, or `High` (default). Impacts scheduling order. |
| `payload` | ⭕️ | Serializable data passed to the worklet. |
| `metadata` | ⭕️ | Free-form info available in lifecycle hooks. |
| `signal` | ⭕️ | `AbortSignal` for cancellation. |

---

## 🧱 Core Concepts

<details>
<summary><strong>Worker Pools</strong></summary>
A configurable set of Hermes runtimes (default = number of logical cores). Each worker handles one task at a time.
</details>

<details>
<summary><strong>Scheduler Strategies</strong></summary>
Round-robin by default, with pluggable strategy hooks for deadline-first or priority queues.
</details>

<details>
<summary><strong>Progress Streams</strong></summary>
Worklets can emit 0..1 progress values via `reportProgress`. Values are throttled to avoid overwhelming the bridge.
</details>

<details>
<summary><strong>Lifecycle Hooks</strong></summary>
Subscribe with `threadForge.onTaskStart`, `.onTaskComplete`, `.onError`, `.onProgress`, or provide custom observers at init time.
</details>

---

## 🧩 Configuration Matrix

```ts
threadForge.initialize(threads, {
  progressThrottleMs: 50,
  fallbackPriority: TaskPriority.Normal,
  maxQueueSize: 200,
  retryPolicy: {
    retries: 2,
    backoffMs: attempt => attempt * 250,
  },
  adapters: {
    storage: async task => persistTask(task),
    logger: event => analytics.track(event),
  },
});
```

| Option | Default | Description |
| --- | --- | --- |
| `progressThrottleMs` | `100` | Debounce for progress events on the JS bridge. |
| `fallbackPriority` | `TaskPriority.Normal` | Priority used when not specified. |
| `maxQueueSize` | `Infinity` | Rejects new tasks when the queue is full. |
| `retryPolicy` | `undefined` | Automatic retries with custom backoff. |
| `adapters.storage` | `undefined` | Persist tasks between app launches. |
| `adapters.logger` | `console` | Centralized logging sink. |

---

## 📊 Observability Recipes

```ts
threadForge.onTaskStart(task => {
  timeline.begin(task.id, task.metadata);
});

threadForge.onTaskComplete((task, result) => {
  timeline.end(task.id, { duration: result.durationMs });
});

threadForge.onProgress((taskId, value) => {
  profiler.mark(taskId, value);
});
```

- Feed events into Sentry, Datadog, or your favorite analytics provider.
- Render in-app overlays by piping progress to Zustand/Recoil stores.
- Combine with React Native Reanimated for delightful progress indicators.

---

## 🧪 Testing Toolkit

| Tool | How to use |
| --- | --- |
| `createMockThreadForge()` | Swap the real runtime for synchronous mocks in Jest. |
| `flushThreadForge()` | Await all queued tasks in tests. |
| `serializeWorklet()` | Validate that a worklet is serializable before runtime. |

Example:

```ts
import { createMockThreadForge } from 'react-native-threadforge/testing';

const forge = createMockThreadForge();
forge.initialize(2);

const task = jest.fn().mockReturnValue('done');
await forge.runTask({ id: 'unit', worklet: task });

expect(task).toHaveBeenCalled();
```

---

## 🛡️ Error Handling Patterns

- Wrap critical sections with `try/catch` **inside** the worklet to emit domain-specific errors.
- Provide an `onError` callback during initialization to centralize reporting.
- Use `retryPolicy` for transient failures (network, IO) and cancellation tokens for user-driven aborts.

```ts
threadForge.initialize(4, {
  onError(error, task) {
    crashlytics.recordError(error, { taskId: task.id });
  },
  retryPolicy: { retries: 1, backoffMs: () => 500 },
});
```

---

## 🪜 Migration Guide

| From | To | Notes |
| --- | --- | --- |
| `react-native-workers` | `threadForge` | Replace worker creation code with `threadForge.initialize`. Map message handlers to lifecycle hooks. |
| Custom native modules | `threadForge` | Move synchronous JS functions into worklets, keep native modules for device APIs only. |
| `InteractionManager.runAfterInteractions` | `threadForge` | Offload heavy logic, keep UI interactions fluid. |

---

## 🧰 Advanced Patterns

- **Worklet factories**: generate parameterized functions and attach metadata for analytics.
- **Task batching**: use `threadForge.runTasks` (experimental) to submit arrays with shared cancellation.
- **Shared memory**: integrate with `react-native-mmkv` or `react-native-blob-util` to pass references instead of large payloads.
- **Hybrid schedulers**: inject custom `SchedulerAdapter` to blend FIFO + priority rules.

---

## 🔍 Troubleshooting

| Symptom | Fix |
| --- | --- |
| `TypeError: worklet is not serializable` | Ensure the function is self-contained (no closures) or define `worklet.__threadforgeSource`. |
| Tasks never resolve on iOS | Run `npx pod-install` and clean build (`xcodebuild -workspace ios/...`). |
| Progress is choppy | Lower `progressThrottleMs` or emit fewer updates from the worklet. |
| Queue keeps growing | Configure `maxQueueSize` and show UI feedback when the queue is saturated. |

Still stuck? Ping us on Slack (`#threadforge-support`).

---

## 📦 Publishing

```bash
npm run build:lib
npm publish --access public
```

- Bumps managed via [Changesets](https://github.com/changesets/changesets) (see `/packages`).
- CI runs tests, typechecks, and produces the `dist/` artifacts automatically.

---

## 📚 Further Reading

- [ThreadForge demo walkthrough](../../README.md#-guided-tour)
- [Architecture diagrams](../../docs)
- [React Native Hermes documentation](https://reactnative.dev/docs/hermes)

---

## 📄 License

Licensed under the [MIT License](../../LICENSE).

<p align="center">Engineered with ❤️ for high-performance React Native teams.</p>
