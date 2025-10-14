import React, { useEffect, useState, useRef } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
} from 'react-native';
import {
  threadForge,
  TaskPriority,
  ThreadForgeTaskDescriptor,
} from './packages/react-native-threadforge/src/index';

type TaskInfo = {
  id: string;
  label: string;
  status: 'pending' | 'done' | 'cancelled' | 'error';
  result?: string;
};

function App(): JSX.Element {
  const [stats, setStats] = useState({ threadCount: 0, pendingTasks: 0, activeTasks: 0 });
  const [tasks, setTasks] = useState<TaskInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [uiCounter, setUiCounter] = useState(0);
  const counterRef = useRef<NodeJS.Timeout | null>(null);
  const statsRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    (async () => {
      try {
        await threadForge.initialize(4);
        await updateStats();
        console.log('✅ ThreadForge initialized');
      } catch (err) {
        Alert.alert('Error', String(err));
      }
    })();

    counterRef.current = setInterval(() => setUiCounter((v) => (v + 1) % 10000), 200);
    statsRef.current = setInterval(updateStats, 1000);

    return () => {
      if (counterRef.current) clearInterval(counterRef.current);
      if (statsRef.current) clearInterval(statsRef.current);
      threadForge.shutdown();
    };
  }, []);

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

  const runTask = async (label: string, descriptor: ThreadForgeTaskDescriptor, priority: TaskPriority) => {
    const id = `${label}-${Date.now()}`;
    addTask(id, label);
    setLoading(true);

    try {
      const res = await threadForge.runTask(id, descriptor, priority);
      updateTaskStatus(id, { status: 'done', result: res });
    } catch (e) {
      updateTaskStatus(id, { status: 'error', result: String(e) });
    } finally {
      setLoading(false);
    }
  };

  const cancelTask = async (id: string) => {
    try {
      await threadForge.cancelTask(id);
      updateTaskStatus(id, { status: 'cancelled', result: '🛑 Cancelled by user' });
    } catch (e) {
      Alert.alert('Error cancelling task', String(e));
    }
  };

  // ---------- Task Examples ----------
  const runHeavyTask = () =>
    runTask('HEAVY_LOOP', { type: 'HEAVY_LOOP', iterations: 8_000_000 }, TaskPriority.NORMAL);

  const runOneMinuteTask = () =>
    runTask('TIMED_LOOP', { type: 'TIMED_LOOP', durationMs: 60_000 }, TaskPriority.NORMAL);

  const runMixedTask = () =>
    runTask('MIXED_LOOP', { type: 'MIXED_LOOP', iterations: 5_000_000 }, TaskPriority.HIGH);

  const runInstantTask = () =>
    runTask('INSTANT_MESSAGE', { type: 'INSTANT_MESSAGE', message: 'Hello ThreadForge!' }, TaskPriority.LOW);

  const runParallel = async () => {
    const idPrefix = `parallel-${Date.now()}`;
    for (let i = 0; i < 4; i++) addTask(`${idPrefix}-${i}`, `Parallel-${i + 1}`);
    try {
      const results = await threadForge.runParallelTasks(
        Array.from({ length: 4 }, (_, i) => ({
          id: `${idPrefix}-${i}`,
          descriptor: { type: 'HEAVY_LOOP', iterations: 2_000_000 + i * 1_000_000 },
          priority: TaskPriority.NORMAL,
        }))
      );
      results.forEach((r, i) =>
        updateTaskStatus(`${idPrefix}-${i}`, { status: 'done', result: r })
      );
    } catch (e) {
      Alert.alert('Parallel error', String(e));
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.header}>⚡ ThreadForge Test App</Text>

        {/* Stats */}
        <View style={styles.statsCard}>
          <Text style={styles.stat}>🧵 Threads: {stats.threadCount}</Text>
          <Text style={styles.stat}>⏳ Pending: {stats.pendingTasks}</Text>
          <Text style={styles.stat}>⚙️ Active: {stats.activeTasks}</Text>
          <Text style={styles.stat}>🎡 UI Counter: {uiCounter}</Text>
        </View>

        {/* Task Buttons */}
        <View style={styles.buttonGroup}>
          <TouchableOpacity style={[styles.btn, styles.btnBlue]} onPress={runHeavyTask} disabled={loading}>
            <Text style={styles.btnText}>Run Heavy Task</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.btnRed]} onPress={runOneMinuteTask} disabled={loading}>
            <Text style={styles.btnText}>Run 1-Minute Task</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.btnGreen]} onPress={runMixedTask} disabled={loading}>
            <Text style={styles.btnText}>Run Mixed Task</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.btnGray]} onPress={runInstantTask}>
            <Text style={styles.btnText}>Run Instant Task</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.btnOrange]} onPress={runParallel} disabled={loading}>
            <Text style={styles.btnText}>Run Parallel Tasks</Text>
          </TouchableOpacity>
        </View>

        {/* Task List */}
        <View style={styles.taskList}>
          <Text style={styles.taskHeader}>📋 Running / Completed Tasks</Text>
          {tasks.length === 0 ? (
            <Text style={styles.noTasks}>No tasks yet</Text>
          ) : (
            tasks.map((task) => (
              <View key={task.id} style={styles.taskRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.taskLabel}>{task.label}</Text>
                  <Text style={styles.taskStatus}>
                    {task.status === 'pending'
                      ? '⏳ Running...'
                      : task.status === 'done'
                      ? '✅ Done'
                      : task.status === 'cancelled'
                      ? '🛑 Cancelled'
                      : '❌ Error'}
                  </Text>
                  {task.result && (
                    <Text style={styles.taskResult} numberOfLines={1}>
                      {task.result}
                    </Text>
                  )}
                </View>
                {task.status === 'pending' && (
                  <TouchableOpacity
                    style={[styles.btnSmall, styles.btnRed]}
                    onPress={() => cancelTask(task.id)}>
                    <Text style={styles.btnTextSmall}>Cancel</Text>
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

// ---------------- STYLES ----------------
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0E27' },
  scrollContent: { padding: 20 },
  header: { color: '#00D9FF', fontSize: 28, fontWeight: 'bold', textAlign: 'center', marginBottom: 16 },
  statsCard: {
    backgroundColor: '#1A1F3A',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  stat: { color: '#E0E6ED', fontSize: 14, paddingVertical: 2 },
  buttonGroup: { marginBottom: 20 },
  btn: {
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginVertical: 6,
  },
  btnBlue: { backgroundColor: '#00D9FF' },
  btnGreen: { backgroundColor: '#4CAF50' },
  btnRed: { backgroundColor: '#E53935' },
  btnGray: { backgroundColor: '#2A3052' },
  btnOrange: { backgroundColor: '#FF9800' },
  btnText: { color: '#FFF', fontWeight: '600' },
  taskList: {
    backgroundColor: '#1A1F3A',
    padding: 16,
    borderRadius: 12,
    borderColor: '#2A3052',
    borderWidth: 1,
  },
  taskHeader: { color: '#00D9FF', fontWeight: 'bold', marginBottom: 8 },
  noTasks: { color: '#8B92B0', fontStyle: 'italic' },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomColor: '#2A3052',
    borderBottomWidth: 1,
    paddingVertical: 6,
  },
  taskLabel: { color: '#E0E6ED', fontSize: 14, fontWeight: '600' },
  taskStatus: { color: '#8B92B0', fontSize: 13 },
  taskResult: { color: '#A0A8C2', fontSize: 12 },
  btnSmall: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    marginLeft: 8,
  },
  btnTextSmall: { color: '#FFF', fontSize: 12 },
});

export default App;
