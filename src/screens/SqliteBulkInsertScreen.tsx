import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import SQLite, { SQLiteDatabase, Transaction } from 'react-native-sqlite-storage';
import { TaskPriority, threadForge } from '../../packages/react-native-threadforge/src';
import { createSqliteOrderBatchTask } from '../tasks/sqlite';

const useIsTestEnvironment = () =>
  typeof process !== 'undefined' && typeof process.env?.JEST_WORKER_ID === 'string';

SQLite.enablePromise?.(true);

type Props = {
  onBack: () => void;
};

type Summary = {
  totalRows: number;
  revenue: number;
  margin: number;
  topCategories: Array<{ category: string; revenue: number }>;
};

const TOTAL_BATCHES = 20;
const BATCH_SIZE = 500;

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
    value,
  );
};

export const SqliteBulkInsertScreen: React.FC<Props> = ({ onBack }) => {
  const [isWorking, setIsWorking] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);
  const dbRef = useRef<SQLiteDatabase | null>(null);
  const isTestEnv = useIsTestEnvironment();

  const ensureDatabase = useCallback(async () => {
    if (isTestEnv) {
      throw new Error('SQLite demo unavailable in test environments');
    }

    if (dbRef.current) {
      return dbRef.current;
    }

    const database = await SQLite.openDatabase({ name: 'threadforge-demo.db', location: 'default' });
    dbRef.current = database;
    return database;
  }, [isTestEnv]);

  const runTransaction = useCallback(async (callback: (tx: Transaction) => void) => {
    const db = await ensureDatabase();
    await new Promise<void>((resolve, reject) => {
      db.transaction(callback, (txnError) => reject(txnError), resolve);
    });
  }, [ensureDatabase]);

  const resetTable = useCallback(async () => {
    const db = await ensureDatabase();
    await db.executeSql('DROP TABLE IF EXISTS orders');
    await db.executeSql(
      [
        'CREATE TABLE IF NOT EXISTS orders (',
        'orderId INTEGER PRIMARY KEY NOT NULL,',
        'customerId INTEGER NOT NULL,',
        'category TEXT NOT NULL,',
        'segment TEXT NOT NULL,',
        'createdMonth INTEGER NOT NULL,',
        'amount REAL NOT NULL,',
        'margin REAL NOT NULL',
        ')',
      ].join(' '),
    );
  }, [ensureDatabase]);

  const fetchSummary = useCallback(async (): Promise<Summary> => {
    const db = await ensureDatabase();
    const [totalsResult] = await db.executeSql(
      'SELECT COUNT(*) as totalRows, SUM(amount) as revenue, SUM(margin) as margin FROM orders',
    );
    const totalsRow = totalsResult.rows.item(0) as { totalRows: number; revenue: number; margin: number };

    const [categoryResult] = await db.executeSql(
      'SELECT category, SUM(amount) as revenue FROM orders GROUP BY category ORDER BY revenue DESC LIMIT 3',
    );

    const topCategories = Array.from({ length: categoryResult.rows.length }).map((_, index) => {
      const row = categoryResult.rows.item(index) as { category: string; revenue: number };
      return { category: row.category, revenue: row.revenue };
    });

    return {
      totalRows: Number(totalsRow.totalRows ?? 0),
      revenue: Number(totalsRow.revenue ?? 0),
      margin: Number(totalsRow.margin ?? 0),
      topCategories,
    };
  }, [ensureDatabase]);

  const insertBatch = useCallback(
    async (batchIndex: number) => {
      const rows = await threadForge.runFunction(
        `SQLiteOrders-${Date.now()}-${batchIndex}`,
        createSqliteOrderBatchTask({
          batchSize: BATCH_SIZE,
          batchIndex,
          totalBatches: TOTAL_BATCHES,
        }),
        TaskPriority.HIGH,
      );

      await runTransaction((tx) => {
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
      });
    },
    [runTransaction],
  );

  const runScenario = useCallback(async () => {
    setIsWorking(true);
    setError(null);
    setSummary(null);
    setStatus('Preparing database...');
    setProgress(0);

    try {
      await resetTable();

      for (let batch = 0; batch < TOTAL_BATCHES; batch++) {
        setStatus(`Generating batch ${batch + 1} of ${TOTAL_BATCHES}`);
        await insertBatch(batch);
        setStatus(`Inserted ${(batch + 1) * BATCH_SIZE} rows`);
        setProgress((batch + 1) / TOTAL_BATCHES);
      }

      setStatus('Querying summary metrics...');
      const nextSummary = await fetchSummary();
      setSummary(nextSummary);
      setStatus('Completed heavy SQLite insert and analytics run');
    } catch (err) {
      console.error('[SqliteBulkInsertScreen] runScenario error', err);
      setError(err instanceof Error ? err.message : String(err));
      setStatus('Encountered an error');
    } finally {
      setIsWorking(false);
    }
  }, [fetchSummary, insertBatch, resetTable]);

  useEffect(() => {
    return () => {
      if (dbRef.current) {
        dbRef.current.close().catch((err) => {
          console.warn('[SqliteBulkInsertScreen] Error closing database', err);
        });
      }
    };
  }, []);

  const summaryLines = useMemo(() => {
    if (!summary) {
      return null;
    }

    const categoryLine =
      summary.topCategories.length === 0
        ? 'No category data available yet.'
        : summary.topCategories
            .map((entry) => `${entry.category}: ${formatCurrency(entry.revenue)}`)
            .join(' • ');

    return [
      `Inserted rows: ${summary.totalRows.toLocaleString()}`,
      `Revenue captured: ${formatCurrency(summary.revenue)}`,
      `Margin tracked: ${formatCurrency(summary.margin)}`,
      `Top categories: ${categoryLine}`,
    ];
  }, [summary]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>SQLite Bulk Insert Demo</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.description}>
          This scenario exercises <Text style={styles.highlight}>react-native-sqlite-storage</Text> by inserting
          {` ${TOTAL_BATCHES * BATCH_SIZE}`} synthetic orders in batches. Each batch is generated off the UI thread
          with ThreadForge, then persisted natively before running summary analytics with SQL queries.
        </Text>

        <TouchableOpacity
          style={[styles.actionButton, isWorking && styles.actionButtonDisabled]}
          onPress={runScenario}
          disabled={isWorking}
        >
          <Text style={styles.actionButtonText}>
            {isWorking ? 'Running SQLite scenario…' : 'Start SQLite Bulk Insert'}
          </Text>
        </TouchableOpacity>

        <View style={styles.statusCard}>
          <Text style={styles.statusTitle}>Status</Text>
          <Text style={styles.statusMessage}>{status || 'Idle – tap the button above to begin.'}</Text>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>
          {isWorking && (
            <View style={styles.indicatorRow}>
              <ActivityIndicator color="#38bdf8" />
              <Text style={styles.indicatorText}>Working…</Text>
            </View>
          )}
        </View>

        {error && (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Error</Text>
            <Text style={styles.errorMessage}>{error}</Text>
          </View>
        )}

        {summaryLines && (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Summary</Text>
            {summaryLines.map((line) => (
              <Text key={line} style={styles.summaryText}>
                {line}
              </Text>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 12,
  },
  backButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(148, 163, 184, 0.2)',
  },
  backText: {
    color: '#e2e8f0',
    fontSize: 16,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '700',
    color: '#f8fafc',
    marginRight: 36,
  },
  content: {
    padding: 24,
    paddingBottom: 48,
  },
  description: {
    fontSize: 16,
    color: '#cbd5f5',
    marginBottom: 24,
    lineHeight: 22,
  },
  highlight: {
    color: '#38bdf8',
    fontWeight: '600',
  },
  actionButton: {
    backgroundColor: '#38bdf8',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 20,
  },
  actionButtonDisabled: {
    opacity: 0.6,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
  },
  statusCard: {
    backgroundColor: '#111c34',
    borderRadius: 16,
    padding: 18,
    marginBottom: 20,
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 8,
  },
  statusMessage: {
    color: '#e2e8f0',
    marginBottom: 12,
  },
  progressBar: {
    height: 8,
    borderRadius: 999,
    backgroundColor: '#1e293b',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#38bdf8',
  },
  indicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  indicatorText: {
    color: '#cbd5f5',
    marginLeft: 8,
  },
  errorCard: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderRadius: 16,
    padding: 18,
    marginBottom: 20,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f87171',
    marginBottom: 6,
  },
  errorMessage: {
    color: '#fecaca',
  },
  summaryCard: {
    backgroundColor: '#1f2937',
    borderRadius: 16,
    padding: 18,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 8,
  },
  summaryText: {
    color: '#e2e8f0',
    marginBottom: 4,
  },
});

export default SqliteBulkInsertScreen;
