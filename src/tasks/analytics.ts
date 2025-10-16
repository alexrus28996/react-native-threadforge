import { ThreadTask, withThreadSource } from './threadHelpers';

type AnalyticsResult = string;

export const createAnalyticsTask = (): ThreadTask<AnalyticsResult> => {
  const fn: ThreadTask<AnalyticsResult> = () => {
    const samples = 600_000;
    let sum = 0;
    let sumOfSquares = 0;

    for (let i = 0; i < samples; i++) {
      const value = Math.sin(i / 40) + Math.cos(i / 23);
      sum += value;
      sumOfSquares += value * value;
      if (i % 120_000 === 0) {
        globalThis.reportProgress?.(i / (samples * 2));
      }
    }

    const mean = sum / samples;

    let drift = 0;
    for (let i = 0; i < samples; i++) {
      const trend = Math.sin((i + 1) / 55) + Math.cos((i + 5) / 37);
      drift += Math.abs(trend - mean);
      if (i % 120_000 === 0) {
        const offset = i / (samples * 2);
        globalThis.reportProgress?.(0.5 + offset);
      }
    }

    const variance = sumOfSquares / samples - mean * mean;
    const stdDev = Math.sqrt(Math.max(variance, 0));
    globalThis.reportProgress?.(1);
    return `📊 mean=${mean.toFixed(4)} σ=${stdDev.toFixed(4)} drift=${drift.toFixed(2)}`;
  };

  return withThreadSource(fn, [
    '() => {',
    '  const samples = 600000;',
    '  let sum = 0;',
    '  let sumOfSquares = 0;',
    '  for (let i = 0; i < samples; i++) {',
    '    const value = Math.sin(i / 40) + Math.cos(i / 23);',
    '    sum += value;',
    '    sumOfSquares += value * value;',
    '    if (i % 120000 === 0) {',
    '      globalThis.reportProgress?.(i / (samples * 2));',
    '    }',
    '  }',
    '  const mean = sum / samples;',
    '  let drift = 0;',
    '  for (let i = 0; i < samples; i++) {',
    '    const trend = Math.sin((i + 1) / 55) + Math.cos((i + 5) / 37);',
    '    drift += Math.abs(trend - mean);',
    '    if (i % 120000 === 0) {',
    '      const offset = i / (samples * 2);',
    '      globalThis.reportProgress?.(0.5 + offset);',
    '    }',
    '  }',
    '  const variance = sumOfSquares / samples - mean * mean;',
    '  const stdDev = Math.sqrt(Math.max(variance, 0));',
    '  globalThis.reportProgress?.(1);',
    '  return `📊 mean=${mean.toFixed(4)} σ=${stdDev.toFixed(4)} drift=${drift.toFixed(2)}`;',
    '}',
  ]);
};
