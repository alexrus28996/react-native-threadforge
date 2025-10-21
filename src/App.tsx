// Author: Abhishek Kumar <alexrus28996@gmail.com>
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
  DEFAULT_THREAD_COUNT,
  threadForge,
  TaskPriority,
  ThreadForgeCancelledError,
  ThreadForgeStats,
} from '../packages/react-native-threadforge/src';

import { showAlert } from './utils/showAlert';
import { createImageProcessingTask } from './tasks/imageProcessing';
import { createAnalyticsTask } from './tasks/analytics';
import { createHeavyMathTask } from './tasks/heavyMath';
import { createInstantMessageTask } from './tasks/instantMessage';
import { createTimerTask } from './tasks/timer';

// ---------------------- Types ----------------------
type TaskStatus = 'pending' | 'done' | 'cancelled' | 'error';

interface TaskInfo {
  id: string;
  label: string;
  status: TaskStatus;
  result?: string;
}

type ProgressMap = Record<string, number>;
type ProgressSubscription = ReturnType<typeof threadForge.onProgress> | null;

// ---------------------- Component ----------------------
const App: React.FC = () => {
  const [stats, setStats] = useState<ThreadForgeStats>({ threadCount: 0, pending: 0, active: 0 });
  const [tasks, setTasks] = useState<TaskInfo[]>([]);
  const [progress, setProgress] = useState<ProgressMap>({});
  const [uiCounter, setUiCounter] = useState(0);
  const [loading, setLoading] = useState(false);

  const progressSubscription = useRef<ProgressSubscription>(null);
  const statsInterval = useRef<NodeJS.Timeout | null>(null);
  const counterInterval = useRef<NodeJS.Timeout | null>(null);

  // ---------------------- Utility handlers ----------------------
  const updateStats = useCallback(async () => {
    try {
      const next = await threadForge.getStats();
      setStats(next);
    } catch (err) {
      console.warn('[ThreadForgeDemo] Unable to fetch stats:', err);
    }
  }, []);

  const addTask = useCallback((id: string, label: string) => {
    setTasks((prev) => [...prev, { id, label, status: 'pending' }]);
  }, []);

  const updateTask = useCallback((id: string, updates: Partial<TaskInfo>) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)));
  }, []);

  const cancelTask = useCallback(
    async (id: string) => {
      try {
        const cancelled = await threadForge.cancelTask(id);
        if (cancelled) updateTask(id, { status: 'cancelled', result: '🛑 Cancelled by user' });
      } catch (err) {
        showAlert('Cancel error', String(err));
      }
    },
    [updateTask],
  );

  // ---------------------- ThreadForge Tasks ----------------------
  const runTask = useCallback(
    async (
      label: string,
      taskFactory: () => unknown,
      priority: TaskPriority = TaskPriority.NORMAL,
    ) => {
      setLoading(true);
      try {
        const { id, result } = await threadForge.run(taskFactory, priority, { idPrefix: label });
        addTask(id, label);
        updateTask(id, { status: 'done', result: String(result) });
      } catch (error: any) {
        if (error instanceof ThreadForgeCancelledError) {
          updateTask(error.message, { status: 'cancelled', result: error.message });
        } else {
          showAlert('Task error', String(error));
        }
      } finally {
        setLoading(false);
      }
    },
    [addTask, updateTask],
  );

  const runParallelBatch = useCallback(async () => {
    const timestamp = Date.now();
    const jobs = Array.from({ length: 4 }, (_, i) => ({
      label: `Parallel-${i + 1}`,
      task: createHeavyMathTask(),
      id: `Parallel-${timestamp}-${i}`,
    }));

    setLoading(true);
    jobs.forEach(({ id, label }) => addTask(id, label));
    try {
      const results = await Promise.all(
        jobs.map(({ task, id }) =>
          threadForge.runFunction(id, task, TaskPriority.NORMAL),
        ),
      );
      results.forEach((r, i) =>
        updateTask(jobs[i]!.id, { status: 'done', result: String(r) }),
      );
    } catch (err) {
      showAlert('Parallel error', String(err));
    } finally {
      setLoading(false);
    }
  }, [addTask, updateTask]);

  // ---------------------- Lifecycle ----------------------
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        await threadForge.initialize(DEFAULT_THREAD_COUNT);
        if (!mounted) return;

        progressSubscription.current = threadForge.onProgress((taskId, value) => {
          setProgress((prev) => ({ ...prev, [taskId]: value }));
        });

        await updateStats();
      } catch (err) {
        showAlert('Init error', String(err));
      }
    };

    init();
    counterInterval.current = setInterval(
      () => setUiCounter((n) => (n + 1) % 10000),
      200,
    );
    statsInterval.current = setInterval(updateStats, 1000);

    return () => {
      mounted = false;
      counterInterval.current && clearInterval(counterInterval.current);
      statsInterval.current && clearInterval(statsInterval.current);
      progressSubscription.current?.remove();
      threadForge.shutdown();
    };
  }, [updateStats]);

  // ---------------------- Labels ----------------------
  const statusLabel = useMemo<Record<TaskStatus, string>>(
    () => ({
      pending: '⏳ Running…',
      done: '✅ Done',
      cancelled: '🛑 Cancelled',
      error: '❌ Error',
    }),
    [],
  );

  // ---------------------- UI ----------------------
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
            onPress={() => runTask('HeavyMath', createHeavyMathTask())}
            disabled={loading}
          >
            <Text style={styles.buttonText}>Run Heavy Math</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.buttonRed]}
            onPress={() => runTask('Timer5s', createTimerTask(5000), TaskPriority.HIGH)}
            disabled={loading}
          >
            <Text style={styles.buttonText}>Run 5-Second Timer</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.buttonGreen]}
            onPress={() =>
              runTask(
                'InstantMessage',
                createInstantMessageTask('✅ Instant background result'),
                TaskPriority.LOW,
              )
            }
            disabled={loading}
          >
            <Text style={styles.buttonText}>Instant Message</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.buttonOrange]}
            onPress={runParallelBatch}
            disabled={loading}
          >
            <Text style={styles.buttonText}>Run Parallel Batch</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.buttonPurple]}
            onPress={() => {
              runTask('ImageProcessing', createImageProcessingTask());
              runTask('Analytics', createAnalyticsTask());
            }}
            disabled={loading}
          >
            <Text style={styles.buttonText}>Image Processing & Analytics</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.taskList}>
          <Text style={styles.taskHeader}>📋 Tasks</Text>
          {tasks.length === 0 ? (
            <Text style={styles.noTasks}>No tasks yet. Tap a button to start one.</Text>
          ) : (
            tasks.map((t) => (
              <View key={t.id} style={styles.taskRow}>
                <View style={styles.taskInfo}>
                  <Text style={styles.taskLabel}>{t.label}</Text>
                  <Text style={styles.taskStatus}>{statusLabel[t.status]}</Text>

                  {typeof progress[t.id] === 'number' && t.status === 'pending' && (
                    <Text style={styles.taskProgress}>
                      Progress: {Math.round(progress[t.id]! * 100)}%
                    </Text>
                  )}
                  {t.result && (
                    <Text style={styles.taskResult} numberOfLines={1}>
                      {t.result}
                    </Text>
                  )}
                </View>

                {t.status === 'pending' && (
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => cancelTask(t.id)}
                  >
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

// ---------------------- Styles ----------------------
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  content: { padding: 24, paddingBottom: 48 },
  title: { fontSize: 26, fontWeight: '700', color: '#f8fafc', marginBottom: 24 },
  statsCard: { backgroundColor: '#111c34', borderRadius: 14, padding: 18, marginBottom: 24 },
  statText: { fontSize: 16, color: '#e2e8f0', marginBottom: 4 },
  buttonGroup: { marginBottom: 24 },
  button: { paddingVertical: 14, borderRadius: 12, marginBottom: 12, alignItems: 'center' },
  buttonText: { fontSize: 16, fontWeight: '600', color: '#0f172a' },
  buttonBlue: { backgroundColor: '#3b82f6' },
  buttonRed: { backgroundColor: '#ef4444' },
  buttonGreen: { backgroundColor: '#22c55e' },
  buttonOrange: { backgroundColor: '#f97316' },
  buttonPurple: { backgroundColor: '#a855f7' },
  taskList: { backgroundColor: '#111c34', borderRadius: 14, padding: 16 },
  taskHeader: { fontSize: 18, color: '#f1f5f9', marginBottom: 12 },
  noTasks: { color: '#94a3b8' },
  taskRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomColor: '#1e293b',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
  },
  taskInfo: { flex: 1, marginRight: 12 },
  taskLabel: { fontSize: 16, fontWeight: '600', color: '#e2e8f0' },
  taskStatus: { color: '#cbd5f5', marginTop: 4 },
  taskProgress: { color: '#60a5fa', marginTop: 4 },
  taskResult: { color: '#94a3b8', marginTop: 4 },
  cancelButton: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, backgroundColor: '#f87171' },
  cancelText: { color: '#0f172a', fontWeight: '700' },
});

export default App;
