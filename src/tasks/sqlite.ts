import { ThreadTask, withThreadSource } from './threadHelpers';

export type SqliteOrderRow = {
  orderId: number;
  customerId: number;
  category: string;
  segment: string;
  createdMonth: number;
  amount: number;
  margin: number;
};

export type SqliteOrderBatchOptions = {
  batchSize: number;
  batchIndex: number;
  totalBatches: number;
};

export const createSqliteOrderBatchTask = (
  options: SqliteOrderBatchOptions,
): ThreadTask<SqliteOrderRow[]> => {
  const fn: ThreadTask<SqliteOrderRow[]> = () => {
    const batchSize = options.batchSize;
    const batchIndex = options.batchIndex;
    const totalBatches = options.totalBatches;
    const categories = ['Grocery', 'Electronics', 'Home', 'Books', 'Beauty', 'Outdoors'];
    const segments = ['Retail', 'Wholesale', 'Online', 'Enterprise'];
    const rows: SqliteOrderRow[] = [];
    const baseSeed = (batchIndex + 1) * 17_317 + totalBatches * 7_919;
    let seed = baseSeed;
    const nextRandom = () => {
      seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;
      return seed / 4_294_967_295;
    };

    for (let index = 0; index < batchSize; index++) {
      const orderId = batchIndex * batchSize + index + 1;
      const customerId = Math.floor(nextRandom() * 3_500);
      const category = categories[Math.floor(nextRandom() * categories.length)]!;
      const segment = segments[Math.floor(nextRandom() * segments.length)]!;
      const base = 25 + nextRandom() * 475;
      const amount = Math.round(base * (segment === 'Wholesale' ? 0.9 : 1.1) * 100) / 100;
      const margin = Math.round(amount * (0.2 + nextRandom() * 0.4) * 100) / 100;
      const createdMonth = Math.floor(nextRandom() * 12);
      rows.push({ orderId, customerId, category, segment, createdMonth, amount, margin });
    }

    return rows;
  };

  const { batchSize, batchIndex, totalBatches } = options;

  return withThreadSource(fn, [
    '() => {',
    `  const batchSize = ${batchSize};`,
    `  const batchIndex = ${batchIndex};`,
    `  const totalBatches = ${totalBatches};`,
    "  const categories = ['Grocery', 'Electronics', 'Home', 'Books', 'Beauty', 'Outdoors'];",
    "  const segments = ['Retail', 'Wholesale', 'Online', 'Enterprise'];",
    '  const rows = [];',
    '  const baseSeed = (batchIndex + 1) * 17317 + totalBatches * 7919;',
    '  let seed = baseSeed;',
    '  const nextRandom = () => {',
    '    seed = (seed * 1664525 + 1013904223) >>> 0;',
    '    return seed / 4294967295;',
    '  };',
    '  for (let index = 0; index < batchSize; index++) {',
    '    const orderId = batchIndex * batchSize + index + 1;',
    '    const customerId = Math.floor(nextRandom() * 3500);',
    '    const category = categories[Math.floor(nextRandom() * categories.length)];',
    '    const segment = segments[Math.floor(nextRandom() * segments.length)];',
    '    const base = 25 + nextRandom() * 475;',
    "    const amount = Math.round(base * (segment === 'Wholesale' ? 0.9 : 1.1) * 100) / 100;",
    '    const margin = Math.round(amount * (0.2 + nextRandom() * 0.4) * 100) / 100;',
    '    const createdMonth = Math.floor(nextRandom() * 12);',
    '    rows.push({ orderId, customerId, category, segment, createdMonth, amount, margin });',
    '  }',
    '  return rows;',
    '}',
  ]);
};

type SqliteReportResult = string;

export const createSqliteHeavyOperationsTask = (): ThreadTask<SqliteReportResult> => {
  const fn: ThreadTask<SqliteReportResult> = () => {
    const totalOrders = 120_000;
    const categories = ['Grocery', 'Electronics', 'Home', 'Books', 'Beauty', 'Outdoors'];
    const segments = ['Retail', 'Wholesale', 'Online', 'Enterprise'];
    const orders: SqliteOrderRow[] = [];

    let seed = 42;
    const nextRandom = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4_294_967_295;
    };

    for (let i = 0; i < totalOrders; i++) {
      const customerId = Math.floor(nextRandom() * 3_500);
      const category = categories[Math.floor(nextRandom() * categories.length)]!;
      const segment = segments[Math.floor(nextRandom() * segments.length)]!;
      const base = 25 + nextRandom() * 475;
      const amount = Math.round(base * (segment === 'Wholesale' ? 0.85 : 1.12) * 100) / 100;
      const margin = Math.round(amount * (0.22 + nextRandom() * 0.38) * 100) / 100;
      const createdMonth = Math.floor(nextRandom() * 12);
      orders.push({
        orderId: i + 1,
        customerId,
        category,
        amount,
        margin,
        createdMonth,
        segment,
      });
      if (i % 20_000 === 0 && i > 0) {
        globalThis.reportProgress?.(i / (totalOrders * 3));
      }
    }

    const categoryTotals = new Map<string, number>();
    const segmentMargins = new Map<string, number>();
    const monthlyRevenue = Array.from({ length: 12 }, () => 0);
    const customerVisitMask = new Map<number, number>();

    for (let i = 0; i < orders.length; i++) {
      const order = orders[i]!;
      categoryTotals.set(order.category, (categoryTotals.get(order.category) ?? 0) + order.amount);
      segmentMargins.set(order.segment, (segmentMargins.get(order.segment) ?? 0) + order.margin);
      monthlyRevenue[order.createdMonth] += order.amount;
      const mask = customerVisitMask.get(order.customerId) ?? 0;
      customerVisitMask.set(order.customerId, mask | (1 << order.createdMonth));
      if (i % 20_000 === 0 && i > 0) {
        globalThis.reportProgress?.(1 / 3 + i / (orders.length * 3));
      }
    }

    const topCategories = Array.from(categoryTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    const topSegments = Array.from(segmentMargins.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    const peakMonthIndex = monthlyRevenue.reduce((bestIndex, value, index, array) => {
      return value > array[bestIndex]! ? index : bestIndex;
    }, 0);

    const masks = Array.from(customerVisitMask.values());
    const totalCustomers = masks.length;
    let returningCustomers = 0;
    let loyalCustomers = 0;

    const popcount = (mask: number) => {
      let count = 0;
      let value = mask;
      while (value > 0) {
        value &= value - 1;
        count++;
      }
      return count;
    };

    for (let i = 0; i < masks.length; i++) {
      const visits = popcount(masks[i]!);
      if (visits >= 3) {
        returningCustomers++;
      }
      if (visits >= 6) {
        loyalCustomers++;
      }
      if (i % 500 === 0 && i > 0) {
        globalThis.reportProgress?.(2 / 3 + i / (Math.max(1, masks.length) * 3));
      }
    }

    const formatPairs = (entries: Array<[string, number]>, prefix: string) => {
      if (entries.length === 0) {
        return '—';
      }
      return entries
        .map(([name, value]) => `${name} ${prefix}${value.toFixed(0)}`)
        .join(', ');
    };

    const repeatRate = totalCustomers === 0 ? 0 : (returningCustomers / totalCustomers) * 100;
    const loyalRate = totalCustomers === 0 ? 0 : (loyalCustomers / totalCustomers) * 100;

    globalThis.reportProgress?.(1);

    return [
      `🏬 Categories: ${formatPairs(topCategories, '$')}`,
      `🏢 Segments: ${formatPairs(topSegments, '$')}`,
      `📅 Peak month: M${peakMonthIndex + 1} (${monthlyRevenue[peakMonthIndex]!.toFixed(0)})`,
      `🔁 Repeat: ${repeatRate.toFixed(1)}% loyal: ${loyalRate.toFixed(1)}%`,
    ].join(' | ');
  };

  return withThreadSource(fn, [
    '() => {',
    "  const totalOrders = 120000;",
    "  const categories = ['Grocery', 'Electronics', 'Home', 'Books', 'Beauty', 'Outdoors'];",
    "  const segments = ['Retail', 'Wholesale', 'Online', 'Enterprise'];",
    '  const orders = [];',
    '  let seed = 42;',
    '  const nextRandom = () => {',
    '    seed = (seed * 1664525 + 1013904223) >>> 0;',
    '    return seed / 4294967295;',
    '  };',
    '  for (let i = 0; i < totalOrders; i++) {',
    '    const orderId = i + 1;',
    '    const customerId = Math.floor(nextRandom() * 3500);',
    '    const category = categories[Math.floor(nextRandom() * categories.length)];',
    '    const segment = segments[Math.floor(nextRandom() * segments.length)];',
    '    const base = 25 + nextRandom() * 475;',
    "    const amount = Math.round(base * (segment === 'Wholesale' ? 0.85 : 1.12) * 100) / 100;",
    '    const margin = Math.round(amount * (0.22 + nextRandom() * 0.38) * 100) / 100;',
    '    const createdMonth = Math.floor(nextRandom() * 12);',
    '    orders.push({ orderId, customerId, category, amount, margin, createdMonth, segment });',
    '    if (i % 20000 === 0 && i > 0) {',
    '      globalThis.reportProgress?.(i / (totalOrders * 3));',
    '    }',
    '  }',
    '  const categoryTotals = new Map();',
    '  const segmentMargins = new Map();',
    '  const monthlyRevenue = Array.from({ length: 12 }, () => 0);',
    '  const customerVisitMask = new Map();',
    '  for (let i = 0; i < orders.length; i++) {',
    '    const order = orders[i];',
    '    categoryTotals.set(order.category, (categoryTotals.get(order.category) ?? 0) + order.amount);',
    '    segmentMargins.set(order.segment, (segmentMargins.get(order.segment) ?? 0) + order.margin);',
    '    monthlyRevenue[order.createdMonth] += order.amount;',
    '    const mask = customerVisitMask.get(order.customerId) ?? 0;',
    '    customerVisitMask.set(order.customerId, mask | (1 << order.createdMonth));',
    '    if (i % 20000 === 0 && i > 0) {',
    '      globalThis.reportProgress?.(1 / 3 + i / (orders.length * 3));',
    '    }',
    '  }',
    '  const topCategories = Array.from(categoryTotals.entries())',
    '    .sort((a, b) => b[1] - a[1])',
    '    .slice(0, 3);',
    '  const topSegments = Array.from(segmentMargins.entries())',
    '    .sort((a, b) => b[1] - a[1])',
    '    .slice(0, 3);',
    '  const peakMonthIndex = monthlyRevenue.reduce((bestIndex, value, index, array) => {',
    '    return value > array[bestIndex] ? index : bestIndex;',
    '  }, 0);',
    '  const masks = Array.from(customerVisitMask.values());',
    '  const totalCustomers = masks.length;',
    '  let returningCustomers = 0;',
    '  let loyalCustomers = 0;',
    '  const popcount = (mask) => {',
    '    let count = 0;',
    '    let value = mask;',
    '    while (value > 0) {',
    '      value &= value - 1;',
    '      count++;',
    '    }',
    '    return count;',
    '  };',
    '  for (let i = 0; i < masks.length; i++) {',
    '    const visits = popcount(masks[i]);',
    '    if (visits >= 3) {',
    '      returningCustomers++;',
    '    }',
    '    if (visits >= 6) {',
    '      loyalCustomers++;',
    '    }',
    '    if (i % 500 === 0 && i > 0) {',
    '      globalThis.reportProgress?.(2 / 3 + i / (Math.max(1, masks.length) * 3));',
    '    }',
    '  }',
    '  const formatPairs = (entries, prefix) => {',
    "    if (entries.length === 0) {",
    "      return '—';",
    '    }',
    '    return entries',
    '      .map(([name, value]) => `${name} ${prefix}${value.toFixed(0)}`)',
    "      .join(', ');",
    '  };',
    '  const repeatRate = totalCustomers === 0 ? 0 : (returningCustomers / totalCustomers) * 100;',
    '  const loyalRate = totalCustomers === 0 ? 0 : (loyalCustomers / totalCustomers) * 100;',
    '  globalThis.reportProgress?.(1);',
    '  return [',
    "    `🏬 Categories: ${formatPairs(topCategories, '$')}`",
    "    `🏢 Segments: ${formatPairs(topSegments, '$')}`",
    "    `📅 Peak month: M${peakMonthIndex + 1} (${monthlyRevenue[peakMonthIndex].toFixed(0)})`",
    "    `🔁 Repeat: ${repeatRate.toFixed(1)}% loyal: ${loyalRate.toFixed(1)}%`",
    "  ].join(' | ');",
    '}',
  ]);
};

