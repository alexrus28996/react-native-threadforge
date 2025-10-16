import { formatNumber } from '../utils/formatNumber';
import { ThreadTask, withThreadSource } from './threadHelpers';

type TimerResult = string;

export const createTimerTask = (durationMs: number): ThreadTask<TimerResult> => {
  const fn: ThreadTask<TimerResult> = () => {
    const start = Date.now();
    let iterations = 0;

    while (Date.now() - start < durationMs) {
      iterations++;
      Math.log(iterations + 1);
      if (iterations % 25_000 === 0) {
        const elapsed = Date.now() - start;
        globalThis.reportProgress?.(Math.min(1, elapsed / durationMs));
      }
    }

    globalThis.reportProgress?.(1);
    const elapsedSec = (Date.now() - start) / 1_000;
    return `⏱️ ${formatNumber(iterations)} iterations in ~${elapsedSec.toFixed(1)}s`;
  };

  return withThreadSource(fn, [
    '() => {',
    `  const durationMs = ${durationMs};`,
    '  const formatNumber = (value) => {',
    '    try {',
    '      return value.toLocaleString();',
    '    } catch (error) {',
    "      const [integerPart, fractionalPart] = value.toString().split('.');",
    "      const withGroupSeparators = integerPart.replace(/\\B(?=(\\d{3})+(?!\\d))/g, ',');",
    '      return fractionalPart ? `${withGroupSeparators}.${fractionalPart}` : withGroupSeparators;',
    '    }',
    '  };',
    '  const start = Date.now();',
    '  let iterations = 0;',
    '  while (Date.now() - start < durationMs) {',
    '    iterations++;',
    '    Math.log(iterations + 1);',
    '    if (iterations % 25000 === 0) {',
    '      const elapsed = Date.now() - start;',
    '      globalThis.reportProgress?.(Math.min(1, elapsed / durationMs));',
    '    }',
    '  }',
    '  globalThis.reportProgress?.(1);',
    '  const elapsedSec = (Date.now() - start) / 1000;',
    '  return `⏱️ ${formatNumber(iterations)} iterations in ~${elapsedSec.toFixed(1)}s`;',
    '}',
  ]);
};
