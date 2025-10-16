# react-native-threadforge

A tiny helper that lets React Native apps run real JavaScript functions on background threads. Pass a
serializable function to `threadForge.runFunction`, keep the UI responsive, and receive results back as
promises.

This README is intentionally simple so you can copy-paste the snippets straight into your project.

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
required.

---

## Quick start (copy/paste)

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

## Core API recap

```ts
import { threadForge, TaskPriority } from 'react-native-threadforge';

await threadForge.initialize(4);

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

Things to remember:

1. Call `threadForge.initialize()` before using any other method.
2. Provide a unique string id for each task.
3. Your function must be serializable (no closures over non-serializable values).
4. Hermes strips source code in release builds, so set `fn.__threadforgeSource` when bundling for
   production.

---

## Extra usage patterns

### Group multiple jobs

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

### Cancel when a screen unmounts

```tsx
useEffect(() => {
  return () => {
    threadForge.cancelTask('sync-job');
    threadForge.shutdown();
  };
}, []);
```

## 🗄️ SQLite heavy operations

ThreadForge shines when you need to crunch large SQLite result sets without blocking your UI. The demo
application ships with [`createSqliteHeavyOperationsTask`](../../src/tasks/sqlite.ts), which synthesizes
120k order rows, groups them by category and sales segment, and returns a formatted analytics summary.
The app also includes a dedicated **SQLite Bulk Insert** screen that opens a database with
[`react-native-sqlite-storage`](https://github.com/andpor/react-native-sqlite-storage), generates row
batches via `createSqliteOrderBatchTask`, and persists the data before running SQL summaries.

```tsx
import { threadForge, TaskPriority } from 'react-native-threadforge';
import { createSqliteHeavyOperationsTask } from '../src/tasks/sqlite';

await threadForge.initialize(4);

const metrics = await threadForge.runFunction(
  'sqlite-analytics',
  createSqliteHeavyOperationsTask(),
  TaskPriority.HIGH,
);

console.log(metrics);
```

The snippet below mirrors the code behind the new demo screen. Each batch of rows is generated on a
background thread, inserted via native SQL, then summarized with follow-up queries:

```ts
import SQLite from 'react-native-sqlite-storage';
import { threadForge, TaskPriority } from 'react-native-threadforge';
import { createSqliteOrderBatchTask } from '../../src/tasks/sqlite';

const db = await SQLite.openDatabase({ name: 'threadforge-demo.db', location: 'default' });
await db.executeSql('DROP TABLE IF EXISTS orders');
await db.executeSql(
  'CREATE TABLE IF NOT EXISTS orders (orderId INTEGER PRIMARY KEY, customerId INTEGER, category TEXT, segment TEXT, createdMonth INTEGER, amount REAL, margin REAL)',
);

for (let batchIndex = 0; batchIndex < 20; batchIndex++) {
  const rows = await threadForge.runFunction(
    `sqlite-batch-${batchIndex}`,
    createSqliteOrderBatchTask({ batchSize: 500, batchIndex, totalBatches: 20 }),
    TaskPriority.HIGH,
  );

  await new Promise<void>((resolve, reject) => {
    db.transaction(
      (tx) => {
        rows.forEach((row) => {
          tx.executeSql(
            'INSERT INTO orders (orderId, customerId, category, segment, createdMonth, amount, margin) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [
              row.orderId,
              row.customerId,
              row.category,
              row.segment,
              row.createdMonth,
              row.amount,
              row.margin,
            ],
          );
        });
      },
      reject,
      resolve,
    );
  });
}

const [summaryResult] = await db.executeSql(
  'SELECT COUNT(*) as totalRows, SUM(amount) as revenue, SUM(margin) as margin FROM orders',
);
console.log(summaryResult.rows.item(0));
```

For production data you can serialize the rows retrieved from `react-native-quick-sqlite`,
`expo-sqlite`, or any other driver and hydrate them inside a worker. The helper below builds a release
safe worker from dynamic rows by setting the optional `__threadforgeSource` property.

```ts
type SQLiteRow = { category: string; total: number };

const buildSqliteWorker = (rows: SQLiteRow[]) => {
  const json = JSON.stringify(rows);
  const escaped = json.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const worker: (() => string) & { __threadforgeSource?: string } = () => {
    const rowsData = JSON.parse(json);
    const totals = new Map<string, number>();
    for (const row of rowsData) {
      const amount = Number(row.total) || 0;
      const key = row.category ?? 'uncategorized';
      totals.set(key, (totals.get(key) ?? 0) + amount);
    }
    const sorted = Array.from(totals.entries()).sort((a, b) => b[1] - a[1]);
    return sorted
      .slice(0, 5)
      .map(([name, value]) => `${name}: $${value.toFixed(0)}`)
      .join(', ');
  };

  Object.defineProperty(worker, '__threadforgeSource', {
    value: [
      '() => {',
      `  const rowsData = JSON.parse('${escaped}');`,
      '  const totals = new Map();',
      '  for (const row of rowsData) {',
      "    const amount = Number(row.total) || 0;",
      "    const key = row.category ?? 'uncategorized';",
      '    totals.set(key, (totals.get(key) ?? 0) + amount);',
      '  }',
      '  const sorted = Array.from(totals.entries()).sort((a, b) => b[1] - a[1]);',
      "  return sorted.slice(0, 5).map(([name, value]) => `${name}: $${value.toFixed(0)}`).join(', ');",
      '}',
    ].join('\n'),
  });

  return worker;
};

const rows = await quickSQLite.executeAsync('SELECT category, total FROM orders'); // your SQLite client
const summary = await threadForge.runFunction('sqlite-top-categories', buildSqliteWorker(rows));
```

## 🧱 Hermes release builds

Hermes omits JavaScript source code when you create bytecode-only bundles (the default for release
builds). In that mode `fn.toString()` returns a placeholder like `[bytecode]`, which ThreadForge cannot
reconstruct into executable source for the background runtime. When this happens, `runFunction()` throws
with a detailed error.

To keep using ThreadForge in release, provide the original function source via the optional
`__threadforgeSource` property before scheduling the task:

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

---

## Troubleshooting

| Issue | Fix |
| --- | --- |
| `ThreadForge has not been initialized` | Call `threadForge.initialize()` before using any other method. |
| No progress events | Subscribe after initialization and ensure your worker calls `reportProgress`. |
| Release build throws serialization error | Provide `fn.__threadforgeSource` so the engine has the original source text. |
| Native build failure on Android | Run `cd android && ./gradlew clean` to rebuild the shared library. |

---

## License

MIT © Abhishek Kumar (alexrus28996)
