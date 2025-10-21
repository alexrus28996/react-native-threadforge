import React, { useEffect, useRef, useState } from 'react';
import { SafeAreaView, View, Text, Button, ActivityIndicator, Alert, ScrollView } from 'react-native';
import threadForge, {
  TaskPriority,
  ThreadForgeCancelledError,
  type ThreadForgeStats,
} from 'react-native-threadforge';

type TaskState =
  | { phase: 'idle' }
  | { phase: 'running'; id: string; progress: number }
  | { phase: 'done'; id: string; value: number }
  | { phase: 'error'; id?: string; message: string }
  | { phase: 'cancelled'; id: string };

const makeWorker = () => {
  // Self-contained worker function
  const fn = (() => {
    // Example heavy compute
    let sum = 0;
    for (let i = 0; i < 25_000_000; i++) {
      sum += i;
      // If native supports progress events, you'd call reportProgress(i / 25_000_000)
      // This placeholder illustrates long work without external dependencies.
    }
    return sum;
  }) as any;

  // Provide explicit source for Hermes release builds
  fn.__threadforgeSource = `
    (() => {
      let sum = 0;
      for (let i = 0; i < 25000000; i++) {
        sum += i;
      }
      return sum;
    })
  `;
  return fn;
};

export default function App() {
  const [stats, setStats] = useState<ThreadForgeStats>({ threadCount: 0, pending: 0, active: 0 });
  const [state, setState] = useState<TaskState>({ phase: 'idle' });
  const progressSubRef = useRef<{ remove: () => void } | null>(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        await threadForge.initialize(4, { progressThrottleMs: 50 });

        // Optional: subscribe to progress events
        progressSubRef.current = threadForge.onProgress((taskId, p) => {
          setState(s => (s.phase === 'running' && s.id === taskId ? { ...s, progress: p } : s));
        });

        // Read initial stats
        const s = await threadForge.getStats();
        if (mounted) setStats(s);
      } catch (e: any) {
        if (mounted) setState({ phase: 'error', message: e?.message ?? String(e) });
      }
    })();

    return () => {
      mounted = false;
      if (progressSubRef.current) progressSubRef.current.remove();
    };
  }, []);

  const startTask = async () => {
    try {
      const { id, result } = await threadForge.run<number>(makeWorker(), TaskPriority.HIGH, {
        idPrefix: 'demo',
      });
      setState({ phase: 'done', id, value: result });
      const s = await threadForge.getStats();
      setStats(s);
    } catch (e: any) {
      if (e instanceof ThreadForgeCancelledError) {
        setState(prev => (prev.phase === 'running' ? { phase: 'cancelled', id: prev.id } : prev));
      } else {
        setState({ phase: 'error', message: e?.message ?? String(e) });
      }
    }
  };

  const startCancellableTask = async () => {
    setState({ phase: 'running', id: 'long-task-1', progress: 0 });
    try {
      const { id, result } = await threadForge.run<number>(makeWorker(), TaskPriority.NORMAL, {
        id: 'long-task-1',
      });
      setState({ phase: 'done', id, value: result });
    } catch (e: any) {
      if (e instanceof ThreadForgeCancelledError) {
        setState({ phase: 'cancelled', id: 'long-task-1' });
      } else {
        setState({ phase: 'error', message: e?.message ?? String(e) });
      }
    } finally {
      const s = await threadForge.getStats();
      setStats(s);
    }
  };

  const cancelTask = async () => {
    if (state.phase === 'running') {
      const ok = await threadForge.cancelTask(state.id);
      if (!ok) Alert.alert('Cancel', 'Task could not be cancelled (maybe already finished).');
    }
  };

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 8 }}>ThreadForge Demo</Text>

        <Text style={{ marginBottom: 4 }}>
          Threads: {stats.threadCount} • Pending: {stats.pending} • Active: {stats.active}
        </Text>

        <View style={{ height: 12 }} />

        <Button title="Run once (auto id)" onPress={startTask} />

        <View style={{ height: 12 }} />

        <Button title="Run cancellable task (id=long-task-1)" onPress={startCancellableTask} />

        <View style={{ height: 12 }} />

        <Button title="Cancel running task" onPress={cancelTask} />

        <View style={{ height: 16 }} />

        {state.phase === 'idle' && <Text>Status: idle</Text>}
        {state.phase === 'running' && (
          <View>
            <Text>Status: running ({state.id})</Text>
            <Text>Progress: {Math.round(state.progress * 100)}%</Text>
            <View style={{ marginTop: 8 }}>
              <ActivityIndicator />
            </View>
          </View>
        )}
        {state.phase === 'done' && (
          <Text>
            Status: done ({state.id}) — Result: {state.value}
          </Text>
        )}
        {state.phase === 'cancelled' && <Text>Status: cancelled ({state.id})</Text>}
        {state.phase === 'error' && <Text>Status: error — {state.message}</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

