# ThreadForge Demo App & Library

ThreadForge is a React Native playground that demonstrates how to move CPU-heavy JavaScript work onto native thread pools. This repository contains both a demo application and a reusable library for background processing.

## 🚀 Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Start Metro bundler
npm start

# 3. Launch on your preferred platform
npm run android   # or: npm run ios
```

## 📱 Demo Features

| Feature | Description | What You'll Learn |
|---------|-------------|-------------------|
| **Heavy Math** | Crunches millions of `Math.sqrt` calls with progress updates | CPU-intensive calculations without blocking UI |
| **Timer Tasks** | Busy-waits with percentage progress streaming | Long-running operations with real-time feedback |
| **Instant Messages** | Low-priority immediate return tasks | Quick task execution and priority handling |
| **Parallel Batches** | Multi-threaded task execution | Concurrent processing and thread management |
| **Image Processing** | Background image operations with analytics | File processing and data analysis |
| **SQLite Bulk Insert** | Database operations with ThreadForge workers | Data persistence and analytics processing |

## 🏗️ Architecture Overview

### Key Components

| Path | Purpose |
|------|---------|
| [`src/App.tsx`](./src/App.tsx) | Main demo application with all examples |
| [`src/screens/SqliteBulkInsertScreen.tsx`](./src/screens/SqliteBulkInsertScreen.tsx) | SQLite demo with database operations |
| [`src/tasks/*.ts`](./src/tasks) | Ready-to-use worker task factories |
| [`packages/react-native-threadforge/src`](./packages/react-native-threadforge/src) | Public TypeScript API |
| [`packages/react-native-threadforge/ios`](./packages/react-native-threadforge/ios) | Native iOS implementation |
| [`packages/react-native-threadforge/android`](./packages/react-native-threadforge/android) | Native Android implementation |

## 🛠️ Setup Instructions

### Prerequisites
- Node.js 18+
- React Native 0.76+
- Android Studio (for Android)
- Xcode 15+ (for iOS)

### Android Setup

1. **Install Android SDK and JDK 17+**
2. **Configure emulator or device**
3. **Run the demo:**
   ```bash
   npm start
   npm run android
   ```

### iOS Setup

1. **Install Xcode with Command Line Tools**
2. **Install CocoaPods dependencies:**
   ```bash
   npx pod-install ios
   ```
   If you invoke `pod install` manually on Apple Silicon and see an error about `ffi` or `json`
   extensions being built for `x86_64`, install the arm64-native gems first:
   ```bash
   bundle install
   bundle exec pod install
   # or, if you rely on the system Ruby:
   sudo gem uninstall ffi json
   sudo arch -arm64 gem install ffi:1.16.3 json
   ```
3. Confirm Hermes is enabled (ThreadForge depends on it for the background runtime). The default
   React Native template already sets `USE_HERMES=1`, so only change this if you previously disabled
   Hermes.
4. Launch the demo application:
   ```bash
   npm start
   npm run ios
   ```

## 💻 Usage Examples

### Basic ThreadForge Setup

```tsx
import React, { useEffect, useState } from 'react';
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
    
    // Attach source for Hermes compatibility
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

### Parallel Task Execution

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

### SQLite Integration with Modern Libraries

```tsx
import SQLite from 'react-native-sqlite-2'; // Modern, compatible library

const ensureDatabase = async () => {
  const database = await SQLite.openDatabase({
    name: 'my-app.db',
    location: 'default'
  });
  return database;
};

const insertData = async (data) => {
  const db = await ensureDatabase();
  await db.transaction(async (tx) => {
    await tx.executeSql(
      'INSERT INTO orders (id, amount) VALUES (?, ?)',
      [data.id, data.amount]
    );
  });
};
```

### Database Operations with ThreadForge

```tsx
// Generate data on background thread
const generateOrderData = async (batchSize: number) => {
  const task = () => {
    const orders = [];
    for (let i = 0; i < batchSize; i++) {
      orders.push({
        id: Math.random() * 1000000,
        amount: Math.random() * 1000,
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

// Process and insert data
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

## 🔧 Advanced Patterns

### Image Processing Pipeline

```tsx
const processImages = async (imagePaths: string[]) => {
  const processImage = (path: string) => {
    // Simulate image processing
    const startTime = Date.now();
    while (Date.now() - startTime < 2000) {
      // Heavy image processing work
    }
    return { path, processed: true, size: Math.random() * 1000000 };
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
      
      if (i % 1000 === 0) {
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

## 📚 API Reference

### ThreadForge Core Methods

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

### Task Priorities

```tsx
import { TaskPriority } from 'react-native-threadforge';

// High priority for critical tasks
await threadForge.runFunction('critical-task', myFunction, TaskPriority.HIGH);

// Normal priority for standard tasks
await threadForge.runFunction('normal-task', myFunction, TaskPriority.NORMAL);

// Low priority for background tasks
await threadForge.runFunction('background-task', myFunction, TaskPriority.LOW);
```

## 🎯 Best Practices

### 1. **Initialization Pattern**
```tsx
useEffect(() => {
  threadForge.initialize(4); // Start with 2-4 threads
  return () => {
    threadForge.shutdown();
  };
}, []);
```

### 2. **Progress Tracking**
```tsx
useEffect(() => {
  const subscription = threadForge.onProgress((taskId, progress) => {
    if (taskId === 'my-task') {
      setProgress(progress);
    }
  });
  return () => subscription.remove();
}, []);
```

### 3. **Error Handling**
```tsx
const runTask = async () => {
  try {
    const result = await threadForge.runFunction('my-task', myFunction);
    setResult(result);
  } catch (error) {
    console.error('Task failed:', error);
    setError(error.message);
  }
};
```

### 4. **Memory Management**
```tsx
// Process large datasets in chunks
const processLargeDataset = async (data: any[]) => {
  const chunkSize = 1000;
  const chunks = [];
  
  for (let i = 0; i < data.length; i += chunkSize) {
    chunks.push(data.slice(i, i + chunkSize));
  }
  
  const results = await Promise.all(
    chunks.map((chunk, index) => 
      threadForge.runFunction(`chunk-${index}`, () => processChunk(chunk))
    )
  );
  
  return results.flat();
};
```

## 🧪 Testing

```bash
# Run Jest tests
npm test

# Run with coverage
npm test -- --coverage
```

## 📦 Publishing

See [`PUBLISHING.md`](./PUBLISHING.md) for instructions on releasing the ThreadForge package to npm.

## 📄 License

This project is licensed under the MIT License.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/your-repo/issues)
- **Documentation**: [Package README](./packages/react-native-threadforge/README.md)
- **Examples**: Check the `src/tasks/` directory for implementation patterns

---

**Happy threading! 🧵⚡**