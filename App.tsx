import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  threadForge,
  TaskPriority,
  ThreadForgeCancelledError,
  ThreadForgeStats,
} from './packages/react-native-threadforge/src';

declare const reportProgress: (progress: number) => void;

type TaskInfo = {
  id: string;
  label: string;
  status: 'pending' | 'done' | 'cancelled' | 'error';
  result?: string;
};

type ProgressMap = Record<string, number>;

const showAlert = (title: string, message: string) => {
  if (typeof Alert.alert === 'function') {
    Alert.alert(title, message);
  } else {
    console.error(`[ThreadForge] ${title}: ${message}`);
  }
};

const createHeavyFunction = () => () => {
  let sum = 0;
  for (let i = 0; i < 5_000_000; i++) {
    sum += Math.sqrt(i);
    if (i % 200_000 === 0) {
      reportProgress(i / 5_000_000);
    }
  }
  reportProgress(1);
  return sum.toFixed(2);
};

const createTimingFunction = (durationMs: number) => () => {
  const start = Date.now();
  let iterations = 0;
  while (Date.now() - start < durationMs) {
    Math.log(iterations + 1);
    iterations++;
    if (iterations % 25_000 === 0) {
      reportProgress(Math.min(1, (Date.now() - start) / durationMs));
    }
  }
  reportProgress(1);
  return `⏱️ Ran ${iterations} loops in ~${(Date.now() - start) / 1000}s`;
};

const createMessageFunction = (message: string) => () => {
  reportProgress(1);
  return message;
};

function App(): JSX.Element {
  const [stats, setStats] = useState<ThreadForgeStats>({ threadCount: 0, pending: 0, active: 0 });
  const [tasks, setTasks] = useState<TaskInfo[]>([]);
  const [progress, setProgress] = useState<ProgressMap>({});
  const [loading, setLoading] = useState(false);
  const [uiCounter, setUiCounter] = useState(0);
  const counterRef = useRef<NodeJS.Timeout | null>(null);
  const statsRef = useRef<NodeJS.Timeout | null>(null);
  const progressSub = useRef<ReturnType<typeof threadForge.onProgress> | null>(null);
  const isTestEnv = typeof process !== 'undefined' && !!process.env?.JEST_WORKER_ID;

  useEffect(() => {
    if (isTestEnv) {
      return;
    }

    (async () => {
      try {
        await threadForge.initialize(4);
        progressSub.current = threadForge.onProgress((taskId, value) => {
          setProgress((prev) => ({ ...prev, [taskId]: value }));
        });
        await updateStats();
      } catch (err) {
        showAlert('Initialization error', String(err));
      }
    })();

    counterRef.current = setInterval(() => setUiCounter((v) => (v + 1) % 10_000), 200);
    statsRef.current = setInterval(updateStats, 1_000);

    return () => {
      if (counterRef.current) {
        clearInterval(counterRef.current);
      }
      if (statsRef.current) {
        clearInterval(statsRef.current);
      }
      progressSub.current?.remove();
      threadForge.shutdown();
    };
  }, [isTestEnv]);

  const updateStats = async () => {
    try {
      const s = await threadForge.getStats();
      setStats(s);
    } catch {}
  };

  const addTask = (id: string, label: string) => {
    setTasks((prev) => [...prev, { id, label, status: 'pending' }]);
  };

  const updateTaskStatus = (id: string, updates: Partial<TaskInfo>) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)));
  };

  const runBackgroundTask = async (
    label: string,
    fn: () => unknown,
    priority: TaskPriority = TaskPriority.NORMAL,
  ) => {
    const id = `${label}-${Date.now()}`;
    addTask(id, label);
    setLoading(true);
    setProgress((prev) => ({ ...prev, [id]: 0 }));

    try {
      const result = await threadForge.runFunction(id, fn, priority);
      updateTaskStatus(id, { status: 'done', result: String(result) });
    } catch (error) {
      if (error instanceof ThreadForgeCancelledError) {
        updateTaskStatus(id, { status: 'cancelled', result: error.message });
      } else {
        updateTaskStatus(id, { status: 'error', result: String(error) });
      }
    } finally {
      setLoading(false);
    }
  };

  const cancelTask = async (id: string) => {
    try {
      const cancelled = await threadForge.cancelTask(id);
      if (cancelled) {
        updateTaskStatus(id, { status: 'cancelled', result: '🛑 Cancelled by user' });
      }
    } catch (e) {
      showAlert('Error cancelling task', String(e));
    }
  };

  const runParallel = async () => {
    const prefix = `parallel-${Date.now()}`;
    const jobs = Array.from({ length: 4 }, (_, index) => ({
      id: `${prefix}-${index}`,
      fn: createHeavyFunction(),
      priority: TaskPriority.NORMAL,
    }));

    jobs.forEach((job) => {
      addTask(job.id, `Parallel-${job.id.split('-').pop()}`);
      setProgress((prev) => ({ ...prev, [job.id]: 0 }));
    });

    setLoading(true);
    try {
      const results = await Promise.all(
        jobs.map((job) => threadForge.runFunction(job.id, job.fn, job.priority)),
      );
      results.forEach((result, index) => {
        const id = jobs[index]!.id;
        updateTaskStatus(id, { status: 'done', result: String(result) });
      });
    } catch (error) {
      showAlert('Parallel error', String(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.header}>⚡ ThreadForge Demo</Text>

        <View style={styles.statsCard}>
          <Text style={styles.stat}>🧵 Threads: {stats.threadCount}</Text>
          <Text style={styles.stat}>⏳ Pending: {stats.pending}</Text>
          <Text style={styles.stat}>⚙️ Active: {stats.active}</Text>
          <Text style={styles.stat}>🎡 UI Counter: {uiCounter}</Text>
        </View>

        <View style={styles.buttonGroup}>
          <TouchableOpacity
            style={[styles.btn, styles.btnBlue]}
            onPress={() => runBackgroundTask('HeavyMath', createHeavyFunction(), TaskPriority.NORMAL)}
            disabled={loading}
          >
            <Text style={styles.btnText}>Run Heavy Math</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.btnRed]}
            onPress={() => runBackgroundTask('Timed500', createTimingFunction(5_000), TaskPriority.HIGH)}
            disabled={loading}
          >
            <Text style={styles.btnText}>Run 5s Timer</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.btnGreen]}
            onPress={() =>
              runBackgroundTask('Instant', createMessageFunction('✅ Instant result'), TaskPriority.LOW)
            }
          >
            <Text style={styles.btnText}>Instant Message</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.btnOrange]}
            onPress={runParallel}
            disabled={loading}
          >
            <Text style={styles.btnText}>Run Parallel Batch</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.taskList}>
          <Text style={styles.taskHeader}>📋 Tasks</Text>
          {tasks.length === 0 ? (
            <Text style={styles.noTasks}>No tasks yet</Text>
          ) : (
            tasks.map((task) => (
              <View key={task.id} style={styles.taskRow}>
                <View style={styles.taskInfo}>
                  <Text style={styles.taskLabel}>{task.label}</Text>
                  <Text style={styles.taskStatus}>
                    {task.status === 'pending'
                      ? '⏳ Running…'
                      : task.status === 'done'
                      ? '✅ Done'
                      : task.status === 'cancelled'
                      ? '🛑 Cancelled'
                      : '❌ Error'}
                  </Text>
                  {typeof progress[task.id] === 'number' && task.status === 'pending' && (
                    <Text style={styles.taskProgress}>
                      Progress: {Math.round(progress[task.id]! * 100)}%
                    </Text>
                  )}
                  {task.result && (
                    <Text style={styles.taskResult} numberOfLines={1}>
                      {task.result}
                    </Text>
                  )}
                </View>
                {task.status === 'pending' && (
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => cancelTask(task.id)}>
                    <Text style={styles.cancelText}>Cancel</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#10131a',
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 48,
  },
  header: {
    fontSize: 24,
    fontWeight: '600',
    color: '#f4f7ff',
    marginBottom: 24,
  },
  statsCard: {
    backgroundColor: '#182032',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  stat: {
    fontSize: 16,
    color: '#e1e6f9',
    marginBottom: 4,
  },
  buttonGroup: {
    marginBottom: 24,
  },
  btn: {
    paddingVertical: 14,
    borderRadius: 10,
    marginBottom: 12,
    alignItems: 'center',
  },
  btnBlue: {
    backgroundColor: '#3b82f6',
  },
  btnRed: {
    backgroundColor: '#ef4444',
  },
  btnGreen: {
    backgroundColor: '#10b981',
  },
  btnOrange: {
    backgroundColor: '#f97316',
  },
  btnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0b1120',
  },
  taskList: {
    backgroundColor: '#161c2a',
    borderRadius: 12,
    padding: 16,
  },
  taskHeader: {
    fontSize: 18,
    color: '#f4f7ff',
    marginBottom: 12,
  },
  noTasks: {
    color: '#9ca3af',
  },
  taskRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomColor: '#1f2937',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
  },
  taskInfo: {
    flex: 1,
    marginRight: 12,
  },
  taskLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#e5e7eb',
  },
  taskStatus: {
    color: '#d1d5db',
    marginTop: 4,
  },
  taskProgress: {
    color: '#60a5fa',
    marginTop: 4,
  },
  taskResult: {
    color: '#9ca3af',
    marginTop: 4,
  },
  cancelBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#f87171',
  },
  cancelText: {
    color: '#111827',
    fontWeight: '600',
  },
});

export default App;
