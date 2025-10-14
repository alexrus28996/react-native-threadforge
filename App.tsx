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
import { threadForge, TaskPriority } from './packages/react-native-threadforge/src/index';

function App(): JSX.Element {
  const [stats, setStats] = useState({ threadCount: 0, pendingTasks: 0, activeTasks: 0 });
  const [results, setResults] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [uiCounter, setUiCounter] = useState(0);
  const counterRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    try {
      threadForge.initialize(4);
      updateStats();
      console.log('✅ ThreadForge initialized with 4 threads');
    } catch (error) {
      Alert.alert('Error', 'Failed to initialize ThreadForge: ' + error);
    }

    // Foreground UI counter (to prove UI remains responsive)
    counterRef.current = setInterval(() => setUiCounter((c) => (c + 1) % 1000), 200);

    return () => {
      if (counterRef.current) clearInterval(counterRef.current);
      threadForge.shutdown();
      console.log('🧵 ThreadForge shutdown cleanly');
    };
  }, []);

  const updateStats = async () => {
    const currentStats = await threadForge.getStats();
    setStats(currentStats);
  };

    const runOneMinuteTask = async () => {
    setLoading(true);
    const start = Date.now();

    try {
      const result = await threadForge.runTask(
        `minute-task-${Date.now()}`,
        () => {
          // Simulate ~1 minute heavy background processing
          const endTime = Date.now() + 60 * 1000; // 60 seconds
          let iteration = 0;
          let sum = 0;

          while (Date.now() < endTime) {
            // CPU work simulation (to keep thread busy)
            sum += Math.sqrt(iteration % 10000);
            iteration++;
          }

          return `🕐 Task finished in ~${((Date.now() - (endTime - 60000)) / 1000).toFixed(
            1
          )}s | Iterations: ${iteration.toLocaleString()} | Sum: ${sum.toFixed(2)}`;
        },
        TaskPriority.NORMAL
      );

      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      logResult(`✅ Long Task Completed (${elapsed}s): ${result}`);
    } catch (err) {
      logResult(`❌ Error: ${err}`);
    } finally {
      await updateStats();
      setLoading(false);
    }
  };


  const logResult = (message: string) => {
    setResults((prev) => [message, ...prev].slice(0, 15));
  };

  const runBackgroundHeavyTask = async () => {
    setLoading(true);
    const start = Date.now();
    try {
      const result = await threadForge.runTask(
        `bg-task-${Date.now()}`,
        () => {
          let total = 0;
          for (let i = 0; i < 10000000; i++) total += Math.sqrt(i);
          return total.toFixed(2);
        },
        TaskPriority.NORMAL
      );

      const elapsed = ((Date.now() - start) / 1000).toFixed(2);
      logResult(`✅ Background Task Result: ${result} (⏱ ${elapsed}s)`);
    } catch (err) {
      logResult(`❌ Error: ${err}`);
    } finally {
      await updateStats();
      setLoading(false);
    }
  };

  const runMixedLoadTest = async () => {
    setLoading(true);
    const start = Date.now();
    try {
      const tasks = Array.from({ length: 4 }, (_, i) => ({
        id: `mix-${Date.now()}-${i}`,
        task: () => {
          let result = 0;
          for (let j = 0; j < 7000000; j++) result += Math.sqrt(j + i);
          return `Task ${i + 1}: Done (${result.toFixed(0)})`;
        },
      }));

      const results = await threadForge.runParallelTasks(tasks);
      const elapsed = ((Date.now() - start) / 1000).toFixed(2);
      logResult(`🔥 Parallel Tasks Finished (${elapsed}s):\n${results.join('\n')}`);
    } catch (err) {
      logResult(`❌ Error: ${err}`);
    } finally {
      await updateStats();
      setLoading(false);
    }
  };

  const runHighPriorityTest = async () => {
    setLoading(true);
    try {
      const result = await threadForge.runTask(
        `hp-${Date.now()}`,
        () => {
          return '🚀 High-priority task executed instantly!';
        },
        TaskPriority.HIGH
      );
      logResult(result);
    } catch (err) {
      logResult(`❌ Error: ${err}`);
    } finally {
      await updateStats();
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>⚡ ThreadForge Test</Text>
          <Text style={styles.subtitle}>Background & Foreground Concurrency Check</Text>
        </View>

        <View style={styles.statsCard}>
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

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.button, styles.buttonPrimary]}
            onPress={runBackgroundHeavyTask}
            disabled={loading}>
            <Text style={styles.buttonText}>
              {loading ? '⏳ Running...' : '🧮 Run Heavy Background Task'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.buttonSuccess]}
            onPress={runMixedLoadTest}
            disabled={loading}>
            <Text style={styles.buttonText}>🔥 Run Parallel Load Test</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.buttonWarning]}
            onPress={runHighPriorityTest}
            disabled={loading}>
            <Text style={styles.buttonText}>⚡ High Priority Task</Text>
          </TouchableOpacity>
          <TouchableOpacity
  style={[styles.button, styles.buttonPrimary]}
  onPress={runOneMinuteTask}
  disabled={loading}>
  <Text style={styles.buttonText}>🕐 1-Minute Heavy Task</Text>
</TouchableOpacity>

        </View>

        <View style={styles.resultsCard}>
          <Text style={styles.resultsTitle}>📊 Task Results</Text>
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
  subtitle: { fontSize: 14, color: '#8B92B0', textAlign: 'center', marginTop: 4 },
  statsCard: {
    backgroundColor: '#1A1F3A',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderColor: '#2A3052',
    borderWidth: 1,
  },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  statLabel: { color: '#8B92B0', fontSize: 15 },
  statValue: { color: '#00D9FF', fontSize: 16, fontWeight: 'bold' },
  buttonContainer: { marginBottom: 20 },
  button: {
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginVertical: 6,
  },
  buttonPrimary: { backgroundColor: '#00D9FF' },
  buttonSuccess: { backgroundColor: '#4CAF50' },
  buttonWarning: { backgroundColor: '#FF6B35' },
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
