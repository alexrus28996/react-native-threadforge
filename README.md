# ThreadForge Demo App & Library

ThreadForge is a React Native playground that demonstrates how to move CPU-heavy JavaScript work onto native thread pools while keeping the UI smooth. The repository ships both a polished demo application and the reusable `react-native-threadforge` library that powers it.

## Project Overview

### Purpose
- Showcase how Hermes-powered React Native apps can delegate work to background threads.
- Provide production-ready primitives for orchestrating long-running or parallel JavaScript tasks.
- Serve as a reference implementation for teams integrating ThreadForge into their own apps.

### Feature Highlights

| Feature | Description | What You Learn |
|---------|-------------|----------------|
| **Heavy Math** | Crunch millions of `Math.sqrt` calls with live progress updates. | Keep CPU-intensive calculations off the main thread. |
| **Timer Tasks** | Demonstrates long-running busy-wait operations with streaming progress. | Send frequent updates from worker threads without blocking renders. |
| **Instant Messages** | Fire-and-forget low-priority tasks that return instantly. | Implement prioritized queues for lightweight jobs. |
| **Parallel Batches** | Executes multiple tasks simultaneously across workers. | Coordinate concurrent background work. |
| **Image Processing** | Simulates pixel crunching and analytics in workers. | Build responsive media pipelines. |
| **SQLite Bulk Insert** | Executes large database writes via ThreadForge workers. | Pair native persistence with background compute. |

### Tech Stack

| Layer | Technologies |
|-------|--------------|
| Core Framework | React Native 0.76, Hermes engine |
| Mobile Platforms | Native iOS (Swift/Objective-C), Native Android (Kotlin/Java) |
| State & UI | React 18 hooks, React Native primitives |
| Data & Storage | `react-native-sqlite-storage` |
| Tooling | Metro bundler, Jest, ESLint, TypeScript |

## Table of Contents
- [Quick Start](#quick-start)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Environment Configuration](#environment-configuration)
- [Running the Project](#running-the-project)
- [Testing](#testing)
- [Deployment](#deployment)
- [Usage Examples](#usage-examples)
- [Architecture Overview](#architecture-overview)
- [Advanced Patterns](#advanced-patterns)
- [API Reference](#api-reference)
- [Contribution Guidelines](#contribution-guidelines)

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Start Metro bundler
npm start

# 3. Launch on your preferred platform
npm run android   # or: npm run ios
```

## Prerequisites
- Node.js 18 or newer (npm 9+ recommended).
- React Native CLI environment for Android and iOS development.
- Android Studio with the latest SDK platform tools.
- Xcode 15+ with Command Line Tools installed.
- A configured device or emulator/simulator for each platform you want to target.

## Installation
1. Clone the repository and change into the project directory.
2. Install JavaScript dependencies with `npm install`.
3. For iOS builds, install CocoaPods dependencies via `npx pod-install ios` (or `bundle exec pod install`).
4. Verify Metro can start successfully by running `npm start`.

## Environment Configuration

### Common
- Ensure Hermes remains enabled (`USE_HERMES=1` in native build configs) because ThreadForge depends on Hermes worker support.
- When editing worker functions, always attach source metadata (`__threadforgeSource`) to keep Hermes compatibility.

### Android
1. Install Android SDK packages (API level 34 or the version matching your emulator).
2. Configure `ANDROID_HOME`/`ANDROID_SDK_ROOT` environment variables and accept SDK licenses.
3. Use JDK 17+ and ensure Gradle can locate it (e.g., `export JAVA_HOME=$(/usr/libexec/java_home -v 17)`).
4. Create or start an emulator from Android Studio before running `npm run android`.

### iOS
1. Install Xcode plus Command Line Tools from Apple.
2. Run `npx pod-install ios` after dependency changes.
3. On Apple Silicon, ensure native gems are arm64-compatible:
   ```bash
   bundle install
   bundle exec pod install
   # Or use system Ruby:
   sudo gem uninstall ffi json
   sudo arch -arm64 gem install ffi:1.16.3 json
   ```
4. Open the workspace in Xcode if you need to tweak signing or inspect native sources.

## Running the Project

### Android
```bash
npm start           # Terminal 1: Metro bundler
npm run android     # Terminal 2: Build & launch on emulator/device
```
Expect the demo home screen to list every showcase (Heavy Math, Timer Tasks, etc.) with responsive navigation between screens.

### iOS
```bash
npm start           # Terminal 1: Metro bundler
npm run ios         # Terminal 2: Build & launch on simulator/device
```
On successful launch, the simulator displays the same catalog of ThreadForge scenarios with live progress indicators.

### Web
ThreadForge currently focuses on native mobile targets. There is no official web build yet, but community experiments using `react-native-web` are welcome. Contributions that add a `npm run web` workflow should document additional setup requirements.

## Testing
```bash
# Run unit tests
npm test

# Run lint checks
npm run lint
```
Both commands must pass locally and in CI before submitting or merging pull requests.

## Deployment
- Publishing instructions for the `react-native-threadforge` package live in [PUBLISHING.md](./PUBLISHING.md).
- Validate Android and iOS releases by running the demo on physical hardware when possible.
- Tag releases with semantic versions (`vX.Y.Z`) and push the tag after publishing.

## Usage Examples

### Basic ThreadForge Setup
Run an expensive computation in the background while keeping the UI responsive:

```tsx
import React, { useEffect, useState } from 'react';
import { Button, Text, View } from 'react-native';
import { threadForge } from 'react-native-threadforge';

export function MyComponent() {
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    // Initialize with 4 worker threads
    threadForge.initialize(4);

    // Listen for progress updates
    const subscription = threadForge.onProgress((taskId, value) => {
      if (taskId === 'my-task') {
        setProgress(value);
      }
    });

    return () => {
      subscription.remove();
      threadForge.shutdown();
    };
  }, []);

  const runHeavyTask = async () => {
    const task = () => {
      let total = 0;
      for (let i = 0; i < 5_000_000; i++) {
        total += Math.sqrt(i);
        if (i % 200_000 === 0) {
          reportProgress(i / 5_000_000);
        }
      }
      return total.toFixed(2);
    };

    Object.defineProperty(task, '__threadforgeSource', {
      value: task.toString()
    });

    const output = await threadForge.runFunction('my-task', task);
    setResult(output);
  };

  return (
    <View>
      <Button title="Run Heavy Task" onPress={runHeavyTask} />
      <Text>Progress: {(progress * 100).toFixed(0)}%</Text>
      <Text>Result: {result ?? '—'}</Text>
    </View>
  );
}
```
**Expected outcome:** Tapping the button animates progress updates from 0–100% while the UI stays interactive, and the result text prints the computed sum.

### Parallel Task Execution
Execute multiple jobs concurrently and cancel them on demand:

```tsx
const taskIds = ['batch-1', 'batch-2', 'batch-3'];

useEffect(() => {
  threadForge.initialize(3);
  return () => {
    taskIds.forEach(id => threadForge.cancelTask(id));
    threadForge.shutdown();
  };
}, []);

const startBatch = () => {
  taskIds.forEach(id => {
    threadForge.runFunction(id, () => {
      for (let i = 0; i < 7_000_000; i++) {
        if (i % 250_000 === 0) {
          reportProgress(i / 7_000_000);
        }
      }
      return `${id} completed`;
    });
  });
};

const cancelAll = () => {
  taskIds.forEach(id => threadForge.cancelTask(id));
};
```
**Expected outcome:** Starting the batch schedules three worker jobs that stream progress independently. Invoking `cancelAll` stops remaining work immediately.

### Database Operations with ThreadForge
Generate data off the main thread and bulk-insert with SQLite:

```tsx
import SQLite from 'react-native-sqlite-storage';

const ensureDatabase = async () => {
  const database = await SQLite.openDatabase({
    name: 'my-app.db',
    location: 'default'
  });
  return database;
};

const generateOrderData = async (batchSize: number) => {
  const task = () => {
    const orders = [];
    for (let i = 0; i < batchSize; i++) {
      orders.push({
        id: Math.random() * 1_000_000,
        amount: Math.random() * 1_000,
        category: ['Electronics', 'Books', 'Clothing'][Math.floor(Math.random() * 3)]
      });
      if (i % 100 === 0) {
        reportProgress(i / batchSize);
      }
    }
    return orders;
  };

  Object.defineProperty(task, '__threadforgeSource', { value: task.toString() });
  return await threadForge.runFunction('generate-orders', task);
};

const processOrders = async () => {
  const orders = await generateOrderData(1000);
  const db = await ensureDatabase();

  await db.transaction(async (tx) => {
    for (const order of orders) {
      await tx.executeSql(
        'INSERT INTO orders (id, amount, category) VALUES (?, ?, ?)',
        [order.id, order.amount, order.category]
      );
    }
  });
};
```
**Expected outcome:** The generator reports progress during batch creation, and once complete the transaction writes every order without stalling UI interactions.

> 💡 Explore the demo application to see these patterns rendered with charts, timers, and real-time counters. Capture device screenshots or screen recordings to document performance improvements when presenting your own benchmarks.

## Architecture Overview

| Path | Purpose |
|------|---------|
| [`src/App.tsx`](./src/App.tsx) | Main demo application with navigation across all examples. |
| [`src/screens/SqliteBulkInsertScreen.tsx`](./src/screens/SqliteBulkInsertScreen.tsx) | SQLite demo showcasing bulk inserts. |
| [`src/tasks/*.ts`](./src/tasks) | Ready-to-use worker task factories. |
| [`packages/react-native-threadforge/src`](./packages/react-native-threadforge/src) | Public TypeScript API surface for the library. |
| [`packages/react-native-threadforge/ios`](./packages/react-native-threadforge/ios) | Native iOS implementation. |
| [`packages/react-native-threadforge/android`](./packages/react-native-threadforge/android) | Native Android implementation. |

## Advanced Patterns

### Image Processing Pipeline

```tsx
const processImages = async (imagePaths: string[]) => {
  const processImage = (path: string) => {
    // Simulate image processing
    const startTime = Date.now();
    while (Date.now() - startTime < 2000) {
      // Heavy image processing work
    }
    return { path, processed: true, size: Math.random() * 1_000_000 };
  };

  Object.defineProperty(processImage, '__threadforgeSource', { value: processImage.toString() });

  const results = await Promise.all(
    imagePaths.map((path, index) =>
      threadForge.runFunction(`image-${index}`, () => processImage(path))
    )
  );

  return results;
};
```

### Data Analytics with Progress Tracking

```tsx
const analyzeData = async (data: any[]) => {
  const analytics = () => {
    const stats = {
      total: data.length,
      categories: new Map(),
      sum: 0,
      average: 0
    };

    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      stats.sum += item.value;
      stats.categories.set(item.category, (stats.categories.get(item.category) || 0) + 1);

      if (i % 1_000 === 0) {
        reportProgress(i / data.length);
      }
    }

    stats.average = stats.sum / stats.total;
    return stats;
  };

  Object.defineProperty(analytics, '__threadforgeSource', { value: analytics.toString() });
  return await threadForge.runFunction('data-analytics', analytics);
};
```

## API Reference

```tsx
// Initialize with N worker threads
threadForge.initialize(threadCount: number): void

// Run function on background thread
threadForge.runFunction(taskId: string, fn: Function): Promise<any>

// Listen for progress updates
threadForge.onProgress(callback: (taskId: string, progress: number) => void): Subscription

// Cancel specific task
threadForge.cancelTask(taskId: string): void

// Get runtime statistics
threadForge.getStats(): Promise<ThreadStats>

// Shutdown thread pool
threadForge.shutdown(): void
```

## Contribution Guidelines

### Branching Strategy
- Create feature branches from `main` using the pattern `feature/<summary>` or `fix/<summary>`.
- Keep branches focused; prefer multiple small PRs over a single massive change.

### Quality Gates
- Run `npm run lint` and `npm test` locally before opening a pull request.
- Provide platform-specific validation details (Android/iOS) in your PR description when changes touch native code.
- Update relevant documentation and example code whenever APIs or behaviors change.

### Pull Request Expectations
- Fill out the PR template (if available) with context, screenshots/GIFs, and testing notes.
- Reference related issues and clearly describe user-facing changes.
- Request reviews from maintainers of affected areas (JS, Android, iOS) and respond to feedback promptly.

### Code of Conduct
We follow the [React Native Code of Conduct](https://reactnative.dev/code-of-conduct). Be respectful, inclusive, and constructive in all project spaces.

