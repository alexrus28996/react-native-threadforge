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
  ThreadForgeTaskDescriptor,
  ThreadForgeScheduledTask,
  TaskPriority,
} from './packages/react-native-threadforge/src/index';

function App(): JSX.Element {
  const [stats, setStats] = useState({ threadCount: 0, pendingTasks: 0, activeTasks: 0 });
  const [results, setResults] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [uiCounter, setUiCounter] = useState(0);
  const [paused, setPaused] = useState(false);
  const counterRef = useRef<NodeJS.Timeout | null>(null);
  const statsRef = useRef<NodeJS.Timeout | null>(null);

  /** Initialize ThreadForge + start foreground counter */
  useEffect(() => {
    (async () => {
      try {
        await threadForge.initialize(4);
        console.log('✅ ThreadForge initialized with 4 threads');
        await updateStats();
      } catch (err) {
        Alert.alert('Error', 'Failed to initialize ThreadForge: ' + err);
      }
    })();

    // Foreground UI counter (proof UI thread stays alive)
    counterRef.current = setInterval(() => setUiCounter((v) => (v + 1) % 10000), 200);

    // Live stats update every second
    statsRef.current = setInterval(updateStats, 1000);

    return () => {
      if (counterRef.current) clearInterval(counterRef.current);
      if (statsRef.current) clearInterval(statsRef.current);
      threadForge.shutdown();
      console.log('🧹 ThreadForge shutdown cleanly');
    };
  }, []);

  const updateStats = async () => {
    try {
      const s = await threadForge.getStats();
      setStats(s);
    } catch {}
  };

  const logResult = (text: string) => {
    setResults((prev) => [text, ...prev].slice(0, 15));
  };

  // ===================== TASK TYPES =====================
  const runHeavyLoop = async () => {
    setLoading(true);
    try {
      const res = await threadForge.runTask(
        `heavy-${Date.now()}`,
        { type: 'HEAVY_LOOP', iterations: 5_000_000 },
        TaskPriority.NORMAL,
      );
      logResult(`✅ Heavy Loop: ${res}`);
    } catch (e) {
      logResult(`❌ ${e}`);
    } finally {
      setLoading(false);
    }
  };

  const runTimedLoop = async () => {
    setLoading(true);
    const start = Date.now();
    try {
      const res = await threadForge.runTask(
        `timed-${Date.now()}`,
        { type: 'TIMED_LOOP', durationMs: 60_000 },
        TaskPriority.NORMAL,
      );
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      logResult(`✅ Timed Loop (1min) done in ${elapsed}s: ${res}`);
    } catch (e) {
      logResult(`❌ ${e}`);
    } finally {
      setLoading(false);
    }
  };

  const runMixedLoop = async () => {
    setLoading(true);
    try {
      const res = await threadForge.runTask(
        `mix-${Date.now()}`,
        { type: 'MIXED_LOOP', iterations: 3_000_000, offset: 200 },
        TaskPriority.HIGH,
      );
      logResult(`⚙️ Mixed Loop: ${res}`);
    } catch (e) {
      logResult(`❌ ${e}`);
    } finally {
      setLoading(false);
    }
  };

  const runInstantMessage = async () => {
    try {
      const res = await threadForge.runTask(
        `msg-${Date.now()}`,
        { type: 'INSTANT_MESSAGE', message: 'Hello from foreground!' },
        TaskPriority.LOW,
      );
      logResult(`💬 ${res}`);
    } catch (e) {
      logResult(`❌ ${e}`);
    }
  };

  const runParallelTasks = async () => {
    setLoading(true);
    try {
      const tasks: ThreadForgeScheduledTask[] = Array.from({ length: 4 }, (_, i) => ({
        id: `parallel-${Date.now()}-${i}`,
        descriptor: { type: 'HEAVY_LOOP', iterations: 2_000_000 + i * 500_000 },
        priority: i === 0 ? TaskPriority.HIGH : TaskPriority.NORMAL,
      }));

      const res = await threadForge.runParallelTasks(tasks);
      logResult(`🔥 Parallel tasks completed:\n${res.join('\n')}`);
    } catch (e) {
      logResult(`❌ ${e}`);
    } finally {
      setLoading(false);
    }
  };

  // ===================== CONTROL =====================
  const cancelExampleTask = async () => {
    try {
      const id = 'cancel-test';
      logResult('🚧 Scheduling cancellable task...');
      const p = threadForge.runTask(
        id,
        { type: 'HEAVY_LOOP', iterations: 100_000_000 },
        TaskPriority.NORMAL,
      );
      setTimeout(async () => {
        await threadForge.cancelTask(id);
        logResult('🛑 Task cancelled!');
      }, 2000);
      await p;
    } catch (e) {
      logResult(`❌ ${e}`);
    }
  };

  const togglePauseResume = async () => {
    try {
      if (paused) {
        await threadForge.resume();
        logResult('▶️ Resumed');
      } else {
        await threadForge.pause();
        logResult('⏸️ Paused');
      }
      setPaused(!paused);
    } catch (e) {
      logResult(`❌ ${e}`);
    }
  };

  const checkPauseState = async () => {
    try {
      const state = await threadForge.isPaused();
      logResult(`🔍 Is Paused: ${state}`);
    } catch (e) {
      logResult(`❌ ${e}`);
    }
  };

  // ===================== RENDER =====================
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>⚡ ThreadForge</Text>
          <Text style={styles.subtitle}>JSI-Based Multithreading Playground</Text>
        </View>

        {/* Live Stats */}
        <View style={styles.statsCard}>
          <Text style={styles.statsTitle}>📊 Engine Stats</Text>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>🧵 Threads:</Text>
            <Text style={styles.statValue}>{stats.threadCount}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>⏳ Pending:</Text>
            <Text style={styles.statValue}>{stats.pendingTasks}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>⚙️ Active:</Text>
            <Text style={styles.statValue}>{stats.activeTasks}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>🎡 UI Counter:</Text>
            <Text style={[styles.statValue, { color: '#FF9B00' }]}>{uiCounter}</Text>
          </View>
        </View>

        {/* Buttons */}
        <View style={styles.buttonContainer}>
          <Text style={styles.sectionTitle}>🧮 Task Tests</Text>
          <TouchableOpacity style={[styles.button, styles.primary]} onPress={runHeavyLoop} disabled={loading}>
            <Text style={styles.buttonText}>Run Heavy Loop</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, styles.danger]} onPress={runTimedLoop} disabled={loading}>
            <Text style={styles.buttonText}>Run 1-Minute Task</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, styles.success]} onPress={runMixedLoop} disabled={loading}>
            <Text style={styles.buttonText}>Run Mixed Loop</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, styles.secondary]} onPress={runInstantMessage}>
            <Text style={styles.buttonText}>Run Instant Message</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, styles.warning]} onPress={runParallelTasks} disabled={loading}>
            <Text style={styles.buttonText}>Run Parallel Tasks</Text>
          </TouchableOpacity>

          <Text style={styles.sectionTitle}>🧭 Controls</Text>
          <TouchableOpacity style={[styles.button, styles.info]} onPress={cancelExampleTask}>
            <Text style={styles.buttonText}>Cancel Example Task</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, styles.primary]} onPress={togglePauseResume}>
            <Text style={styles.buttonText}>{paused ? '▶️ Resume' : '⏸️ Pause'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, styles.info]} onPress={checkPauseState}>
            <Text style={styles.buttonText}>Check Pause State</Text>
          </TouchableOpacity>
        </View>

        {/* Results */}
        <View style={styles.resultsCard}>
          <Text style={styles.resultsTitle}>📜 Results</Text>
          {results.length === 0 ? (
            <Text style={styles.noResults}>No tasks executed yet.</Text>
          ) : (
            results.map((r, i) => (
              <Text key={i} style={styles.resultText}>
                {r}
              </Text>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0E27' },
  scrollContent: { padding: 20 },
  header: { alignItems: 'center', marginBottom: 24, marginTop: 20 },
  title: { fontSize: 32, color: '#00D9FF', fontWeight: 'bold' },
  subtitle: { fontSize: 14, color: '#8B92B0' },
  statsCard: {
    backgroundColor: '#1A1F3A',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderColor: '#2A3052',
    borderWidth: 1,
  },
  statsTitle: { fontSize: 18, fontWeight: '700', color: '#00D9FF', marginBottom: 10 },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  statLabel: { color: '#8B92B0', fontSize: 15 },
  statValue: { color: '#00D9FF', fontSize: 16, fontWeight: 'bold' },
  sectionTitle: { color: '#8B92B0', marginTop: 10, marginBottom: 6, fontWeight: '600' },
  buttonContainer: { marginBottom: 20 },
  button: { padding: 14, borderRadius: 10, alignItems: 'center', marginVertical: 5 },
  primary: { backgroundColor: '#00D9FF' },
  secondary: { backgroundColor: '#2A3052' },
  success: { backgroundColor: '#4CAF50' },
  danger: { backgroundColor: '#E53935' },
  warning: { backgroundColor: '#FF9800' },
  info: { backgroundColor: '#6C63FF' },
  buttonText: { color: '#FFF', fontSize: 15, fontWeight: '600' },
  resultsCard: {
    backgroundColor: '#1A1F3A',
    borderRadius: 16,
    padding: 20,
    borderColor: '#2A3052',
    borderWidth: 1,
  },
  resultsTitle: { fontSize: 18, color: '#00D9FF', marginBottom: 10, fontWeight: '600' },
  noResults: { color: '#8B92B0', fontStyle: 'italic' },
  resultText: { color: '#E0E6ED', fontSize: 13, paddingVertical: 3, fontFamily: 'monospace' },
});

export default App;
