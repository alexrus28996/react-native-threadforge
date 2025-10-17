# react-native-threadforge

A powerful library that enables React Native apps to run JavaScript functions on background threads. Pass serializable functions to `threadForge.runFunction`, keep your UI responsive, and receive results back as promises.

This README provides practical examples you can copy-paste directly into your project.

---

## Installation

```bash
npm install react-native-threadforge
# or
yarn add react-native-threadforge

# iOS only
cd ios && pod install
```

ThreadForge works with the default Hermes engine on React Native 0.73+. No manual native changes are
required. If you disable Hermes for any reason, re-enable it on iOS by keeping `USE_HERMES=1` in your
`Podfile` (ThreadForge creates a Hermes runtime to execute background work).

---

## Quick Start (Copy/Paste Ready)

```tsx
import React, { useEffect, useState } from 'react';
import { Button, Text, View } from 'react-native';
import { threadForge } from 'react-native-threadforge';

export default function Example() {
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    threadForge.initialize(2);
    const sub = threadForge.onProgress((taskId, value) => {
      if (taskId === 'demo') {
        setProgress(value);
      }
    });
    return () => {
      sub.remove();
      threadForge.shutdown();
    };
  }, []);

  const runJob = async () => {
    const heavyWork = () => {
      let total = 0;
      for (let i = 0; i < 5_000_000; i++) {
        total += Math.sqrt(i);
        if (i % 200_000 === 0) {
          reportProgress(i / 5_000_000);
        }
      }
      reportProgress(1);
      return total.toFixed(2);
    };

    Object.defineProperty(heavyWork, '__threadforgeSource', { value: heavyWork.toString() });
    const output = await threadForge.runFunction('demo', heavyWork);
    setResult(output);
  };

  return (
    <View>
      <Button title="Run background job" onPress={runJob} />
      <Text>Progress: {(progress * 100).toFixed(0)}%</Text>
      <Text>Result: {result ?? '—'}</Text>
    </View>
  );
}
```

---

## Core API

```ts
import { DEFAULT_THREAD_COUNT, threadForge, TaskPriority } from 'react-native-threadforge';

await threadForge.initialize(DEFAULT_THREAD_COUNT);

const value = await threadForge.runFunction(
  'task-id',
  () => {
    // heavy synchronous work here
    reportProgress(0.5);
    return 'done';
  },
  TaskPriority.HIGH,
);

const cancelled = await threadForge.cancelTask('task-id');
const stats = await threadForge.getStats();
await threadForge.shutdown();
```

**Key Points:**
1. Call `threadForge.initialize()` before using any other method
2. Provide a unique string id for each task
3. Your function must be serializable (no closures over non-serializable values)
4. Set `fn.__threadforgeSource` for production builds
5. Override progress throttling by passing `{ progressThrottleMs: number }` to `initialize`

### Configuration via environment variables

ThreadForge reads optional environment variables at load time so you can tune behaviour without
changing source code. Use a library such as [`react-native-config`](https://github.com/luggit/react-native-config)
to provide them at build time.

| Variable | Description | Default |
| --- | --- | --- |
| `THREADFORGE_DEFAULT_THREAD_COUNT` | Number of worker threads to start when `threadForge.initialize` is called without an explicit value. | `4` |
| `THREADFORGE_PROGRESS_THROTTLE_MS` | Minimum interval (in milliseconds) between progress updates emitted from native workers. | `100` |

Invalid or missing values automatically fall back to the defaults listed above.

---

## Advanced Usage Patterns

### Parallel Job Execution

```ts
await Promise.all(
  ['job-a', 'job-b', 'job-c'].map((id) =>
    threadForge.runFunction(
      id,
      () => {
        for (let i = 0; i < 3_000_000; i++) {
          if (i % 150_000 === 0) {
            reportProgress(i / 3_000_000);
          }
        }
        reportProgress(1);
        return `${id} complete`;
      },
      TaskPriority.NORMAL,
    ),
  ),
);
```

### Task Cancellation

```tsx
useEffect(() => {
  return () => {
    threadForge.cancelTask('sync-job');
    threadForge.shutdown();
  };
}, []);
```

### Progress Tracking

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

## 🗄️ Database Operations

ThreadForge excels at processing large SQLite datasets without blocking your UI. Here are practical examples:

### SQLite Data Processing

```tsx
import { threadForge, TaskPriority } from 'react-native-threadforge';
import SQLite from 'react-native-sqlite-2'; // Modern SQLite library

const processDatabaseData = async () => {
  // Open database
  const db = await SQLite.openDatabase({
    name: 'my-app.db',
    location: 'default'
  });

  // Create table
  await db.executeSql(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY,
      amount REAL,
      category TEXT,
      created_at DATETIME
    )
  `);

  // Generate data on background thread
  const generateOrders = () => {
    const orders = [];
    for (let i = 0; i < 10000; i++) {
      orders.push({
        amount: Math.random() * 1000,
        category: ['Electronics', 'Books', 'Clothing'][Math.floor(Math.random() * 3)],
        created_at: new Date().toISOString()
      });
      if (i % 1000 === 0) {
        reportProgress(i / 10000);
      }
    }
    return orders;
  };

  Object.defineProperty(generateOrders, '__threadforgeSource', { 
    value: generateOrders.toString() 
  });

  const orders = await threadForge.runFunction('generate-orders', generateOrders, TaskPriority.HIGH);

  // Insert data in batches
  await db.transaction(async (tx) => {
    for (const order of orders) {
      await tx.executeSql(
        'INSERT INTO orders (amount, category, created_at) VALUES (?, ?, ?)',
        [order.amount, order.category, order.created_at]
      );
    }
  });

  // Analyze data on background thread
  const analyzeData = () => {
    const categories = new Map();
    let total = 0;
    
    for (const order of orders) {
      total += order.amount;
      categories.set(order.category, (categories.get(order.category) || 0) + 1);
    }
    
    return {
      totalOrders: orders.length,
      totalRevenue: total,
      categoryBreakdown: Object.fromEntries(categories)
    };
  };

  Object.defineProperty(analyzeData, '__threadforgeSource', { 
    value: analyzeData.toString() 
  });

  const analytics = await threadForge.runFunction('analyze-data', analyzeData, TaskPriority.HIGH);
  
  return analytics;
};
```

### Bulk Data Insertion

```tsx
const bulkInsertOrders = async (orderData: any[]) => {
  const db = await SQLite.openDatabase({ name: 'orders.db', location: 'default' });
  
  // Process data in chunks
  const chunkSize = 500;
  const chunks = [];
  
  for (let i = 0; i < orderData.length; i += chunkSize) {
    chunks.push(orderData.slice(i, i + chunkSize));
  }
  
  // Insert each chunk
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    
    await db.transaction(async (tx) => {
      for (const order of chunk) {
        await tx.executeSql(
          'INSERT INTO orders (id, amount, category) VALUES (?, ?, ?)',
          [order.id, order.amount, order.category]
        );
      }
    });
    
    // Report progress
    console.log(`Inserted chunk ${i + 1}/${chunks.length}`);
  }
};
```

### Data Analytics

```tsx
const performDataAnalytics = async (data: any[]) => {
  const analytics = () => {
    const stats = {
      total: data.length,
      categories: new Map(),
      sum: 0,
      average: 0,
      topCategories: []
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
    stats.topCategories = Array.from(stats.categories.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    
    return stats;
  };
  
  Object.defineProperty(analytics, '__threadforgeSource', { 
    value: analytics.toString() 
  });
  
  return await threadForge.runFunction('data-analytics', analytics, TaskPriority.HIGH);
};
```

## 🖼️ Image Processing

```tsx
const processImages = async (imagePaths: string[]) => {
  const processImage = (path: string) => {
    // Simulate heavy image processing
    const startTime = Date.now();
    while (Date.now() - startTime < 2000) {
      // Image processing work
    }
    return { 
      path, 
      processed: true, 
      size: Math.random() * 1000000,
      timestamp: new Date().toISOString()
    };
  };
  
  Object.defineProperty(processImage, '__threadforgeSource', { 
    value: processImage.toString() 
  });
  
  const results = await Promise.all(
    imagePaths.map((path, index) => 
      threadForge.runFunction(`image-${index}`, () => processImage(path), TaskPriority.NORMAL)
    )
  );
  
  return results;
};
```

## 🧱 Production Builds

For production builds, provide the original function source via `__threadforgeSource`:

```ts
type WorkerFn<T> = (() => T) & { __threadforgeSource?: string };

function makeWorker<T>(fn: WorkerFn<T>): WorkerFn<T> {
  Object.defineProperty(fn, '__threadforgeSource', { value: fn.toString() });
  return fn;
}

const fetchStats = makeWorker(() => {
  reportProgress(0.5);
  return { status: 'ok' };
});

const data = await threadForge.runFunction('stats', fetchStats);
```

## 📊 Performance Tips

### 1. **Optimal Thread Count**
```tsx
// Start with 2-4 threads, adjust based on device
threadForge.initialize(DEFAULT_THREAD_COUNT);
```

### 2. **Chunk Large Datasets**
```tsx
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

### 3. **Progress Reporting**
```tsx
const processWithProgress = () => {
  for (let i = 0; i < 1000000; i++) {
    // Heavy work
    if (i % 10000 === 0) {
      reportProgress(i / 1000000);
    }
  }
  reportProgress(1);
  return 'completed';
};
```

## 🔧 Troubleshooting

| Issue | Solution |
|-------|----------|
| `ThreadForge has not been initialized` | Call `threadForge.initialize()` before using any other method |
| No progress events | Subscribe after initialization and ensure your worker calls `reportProgress` |
| Release build throws serialization error | Provide `fn.__threadforgeSource` so the engine has the original source text |
| Native build failure on Android | Run `cd android && ./gradlew clean` to rebuild the shared library |

## 📄 License

MIT © Abhishek Kumar (alexrus28996)