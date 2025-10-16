import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
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
} from '../packages/react-native-threadforge/src';
import { createHeavyMathTask } from './tasks/heavyMath';
import { createTimerTask } from './tasks/timer';
import { createInstantMessageTask } from './tasks/instantMessage';
import { createImageProcessingTask } from './tasks/imageProcessing';
import { createAnalyticsTask } from './tasks/analytics';
import { createSqliteHeavyOperationsTask } from './tasks/sqlite';
import { ThreadTask } from './tasks/threadHelpers';
import { showAlert } from './utils/showAlert';
import SqliteBulkInsertScreen from './screens/SqliteBulkInsertScreen';

type TaskStatus = 'pending' | 'done' | 'cancelled' | 'error';

type TaskInfo = {
  id: string;
  label: string;
  status: TaskStatus;
  result?: string;
};

type ProgressMap = Record<string, number>;

type ProgressSubscription = ReturnType<typeof threadForge.onProgress> | null;

const useIsTestEnvironment = () =>
  typeof process !== 'undefined' && typeof process.env?.JEST_WORKER_ID === 'string';

const App: React.FC = () => {
  const [stats, setStats] = useState<ThreadForgeStats>({ threadCount: 0, pending: 0, active: 0 });
  const [tasks, setTasks] = useState<TaskInfo[]>([]);
  const [progress, setProgress] = useState<ProgressMap>({});
  const [uiCounter, setUiCounter] = useState(0);
  const [loading, setLoading] = useState(false);
  const [activeScreen, setActiveScreen] = useState<'home' | 'sqlite'>('home');
  const counterInterval = useRef<NodeJS.Timeout | null>(null);
  const statsInterval = useRef<NodeJS.Timeout | null>(null);
  const progressSubscription = useRef<ProgressSubscription>(null);
  const isTestEnv = useIsTestEnvironment();

  const updateStats = useCallback(async () => {
    try {
      const nextStats = await threadForge.getStats();
      setStats(nextStats);
    } catch (error) {
      // Ignore transient native errors; stats will be refreshed on the next interval.
    }
  }, []);

  const addTask = useCallback((id: string, label: string) => {
    setTasks((prev) => [...prev, { id, label, status: 'pending' }]);
  }, []);

  const updateTask = useCallback((id: string, updates: Partial<TaskInfo>) => {
    setTasks((prev) => prev.map((task) => (task.id === id ? { ...task, ...updates } : task)));
  }, []);

  const runBackgroundTask = useCallback(
    async (
      label: string,
      taskFactory: ThreadTask<unknown>,
      priority: TaskPriority = TaskPriority.NORMAL,
    ) => {
      const id = `${label}-${Date.now()}`;
      addTask(id, label);
      setLoading(true);
      setProgress((prev) => ({ ...prev, [id]: 0 }));

      try {
        const result = await threadForge.runFunction(id, taskFactory, priority);
        updateTask(id, { status: 'done', result: String(result) });
      } catch (error) {
        if (error instanceof ThreadForgeCancelledError) {
          updateTask(id, { status: 'cancelled', result: error.message });
        } else {
          updateTask(id, { status: 'error', result: String(error) });
        }
      } finally {
        setLoading(false);
      }
    },
    [addTask, updateTask],
  );

  const cancelTask = useCallback(
    async (id: string) => {
      try {
        const cancelled = await threadForge.cancelTask(id);
        if (cancelled) {
          updateTask(id, { status: 'cancelled', result: '🛑 Cancelled by user' });
        }
      } catch (error) {
        showAlert('Cancel error', String(error));
      }
    },
    [updateTask],
  );

  const runParallelBatch = useCallback(async () => {
    const timestamp = Date.now();
    const jobs = Array.from({ length: 4 }, (_, index) => ({
      id: `Parallel-${timestamp}-${index}`,
      task: createHeavyMathTask(),
    }));

    jobs.forEach(({ id }) => {
      addTask(id, `Parallel ${id.split('-').pop()}`);
      setProgress((prev) => ({ ...prev, [id]: 0 }));
    });

    setLoading(true);
    try {
      const results = await Promise.all(
        jobs.map(({ id, task }) => {
          return threadForge.runFunction(id, task, TaskPriority.NORMAL);
        }),
      );
      results.forEach((result, index) => {
        const { id } = jobs[index]!;
        updateTask(id, { status: 'done', result: String(result) });
      });
    } catch (error) {
      showAlert('Parallel execution error', String(error));
    } finally {
      setLoading(false);
    }
  }, [addTask, updateTask]);

  const statusLabel = useMemo<Record<TaskStatus, string>>(
    () => ({
      pending: '⏳ Running…',
      done: '✅ Done',
      cancelled: '🛑 Cancelled',
      error: '❌ Error',
    }),
    [],
  );

  useEffect(() => {
    if (isTestEnv) {
      return;
    }

    let mounted = true;

    const initialize = async () => {
      try {
        await threadForge.initialize(4);
        if (!mounted) {
          return;
        }

        progressSubscription.current = threadForge.onProgress((taskId, value) => {
          setProgress((prev) => ({ ...prev, [taskId]: value }));
        });

        await updateStats();
      } catch (error) {
        showAlert('Initialization error', String(error));
      }
    };

    initialize();

    counterInterval.current = setInterval(() => {
      setUiCounter((value) => (value + 1) % 10_000);
    }, 200);

    statsInterval.current = setInterval(updateStats, 1_000);

    return () => {
      mounted = false;
      if (counterInterval.current) {
        clearInterval(counterInterval.current);
      }
      if (statsInterval.current) {
        clearInterval(statsInterval.current);
      }
      if (progressSubscription.current) {
        progressSubscription.current.remove();
      }
      void threadForge.shutdown();
    };
  }, [isTestEnv, updateStats]);

  if (activeScreen === 'sqlite') {
    return <SqliteBulkInsertScreen onBack={() => setActiveScreen('home')} />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>⚡ ThreadForge Demo</Text>

        <View style={styles.statsCard}>
          <Text style={styles.statText}>🧵 Threads: {stats.threadCount}</Text>
          <Text style={styles.statText}>⏳ Pending: {stats.pending}</Text>
          <Text style={styles.statText}>⚙️ Active: {stats.active}</Text>
          <Text style={styles.statText}>🎡 UI Counter: {uiCounter}</Text>
        </View>

        <View style={styles.buttonGroup}>
          <TouchableOpacity
            style={[styles.button, styles.buttonBlue]}
            onPress={() => runBackgroundTask('HeavyMath', createHeavyMathTask())}
            disabled={loading && stats.active >= stats.threadCount}
          >
            <Text style={styles.buttonText}>Run Heavy Math</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.buttonRed]}
            onPress={() => runBackgroundTask('Timer5s', createTimerTask(5_000), TaskPriority.HIGH)}
          >
            <Text style={styles.buttonText}>Run 5-Second Timer</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.buttonGreen]}
            onPress={() =>
              runBackgroundTask(
                'InstantMessage',
                createInstantMessageTask('✅ Instant background result'),
                TaskPriority.LOW,
              )
            }
          >
            <Text style={styles.buttonText}>Instant Message</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.button, styles.buttonOrange]} onPress={runParallelBatch}>
            <Text style={styles.buttonText}>Run Parallel Batch</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.buttonPurple]}
            onPress={() => {
              runBackgroundTask('ImageProcessing', createImageProcessingTask());
              runBackgroundTask('Analytics', createAnalyticsTask(), TaskPriority.NORMAL);
            }}
          >
            <Text style={styles.buttonText}>Image Processing & Analytics</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.buttonTeal]}
            onPress={() =>
              runBackgroundTask(
                'SQLiteReport',
                createSqliteHeavyOperationsTask(),
                TaskPriority.HIGH,
              )
            }
          >
            <Text style={styles.buttonText}>SQLite Analytics Batch</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.buttonIndigo]}
            onPress={() => setActiveScreen('sqlite')}
          >
            <Text style={styles.buttonText}>Open SQLite Bulk Insert Demo</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.taskList}>
          <Text style={styles.taskHeader}>📋 Tasks</Text>
          {tasks.length === 0 ? (
            <Text style={styles.noTasks}>No tasks yet. Tap a button to start one.</Text>
          ) : (
            tasks.map((task) => (
              <View key={task.id} style={styles.taskRow}>
                <View style={styles.taskInfo}>
                  <Text style={styles.taskLabel}>{task.label}</Text>
                  <Text style={styles.taskStatus}>{statusLabel[task.status]}</Text>
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
                  <TouchableOpacity style={styles.cancelButton} onPress={() => cancelTask(task.id)}>
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
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  content: {
    padding: 24,
    paddingBottom: 48,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 24,
  },
  statsCard: {
    backgroundColor: '#111c34',
    borderRadius: 14,
    padding: 18,
    marginBottom: 24,
  },
  statText: {
    fontSize: 16,
    color: '#e2e8f0',
    marginBottom: 4,
  },
  buttonGroup: {
    marginBottom: 24,
  },
  button: {
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 12,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
  },
  buttonBlue: {
    backgroundColor: '#3b82f6',
  },
  buttonRed: {
    backgroundColor: '#ef4444',
  },
  buttonGreen: {
    backgroundColor: '#22c55e',
  },
  buttonOrange: {
    backgroundColor: '#f97316',
  },
  buttonPurple: {
    backgroundColor: '#a855f7',
  },
  buttonTeal: {
    backgroundColor: '#14b8a6',
  },
  buttonIndigo: {
    backgroundColor: '#6366f1',
  },
  taskList: {
    backgroundColor: '#111c34',
    borderRadius: 14,
    padding: 16,
  },
  taskHeader: {
    fontSize: 18,
    color: '#f1f5f9',
    marginBottom: 12,
  },
  noTasks: {
    color: '#94a3b8',
  },
  taskRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomColor: '#1e293b',
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
    color: '#e2e8f0',
  },
  taskStatus: {
    color: '#cbd5f5',
    marginTop: 4,
  },
  taskProgress: {
    color: '#60a5fa',
    marginTop: 4,
  },
  taskResult: {
    color: '#94a3b8',
    marginTop: 4,
  },
  cancelButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#f87171',
  },
  cancelText: {
    color: '#0f172a',
    fontWeight: '700',
  },
});

export default App;
