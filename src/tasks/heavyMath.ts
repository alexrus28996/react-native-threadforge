import { ThreadTask, withThreadSource } from './threadHelpers';

type HeavyMathResult = string;

export const createHeavyMathTask = (): ThreadTask<HeavyMathResult> => {
  const fn: ThreadTask<HeavyMathResult> = () => {
    const iterations = 5_000_000;
    let accumulator = 0;

    for (let i = 0; i < iterations; i++) {
      accumulator += Math.sqrt(i);
      if (i % 200_000 === 0) {
        globalThis.reportProgress?.(i / iterations);
      }
    }

    globalThis.reportProgress?.(1);
    return `∑√n ≈ ${accumulator.toFixed(2)}`;
  };

  return withThreadSource(fn, [
    '() => {',
    '  const iterations = 5000000;',
    '  let accumulator = 0;',
    '  for (let i = 0; i < iterations; i++) {',
    '    accumulator += Math.sqrt(i);',
    '    if (i % 200000 === 0) {',
    '      globalThis.reportProgress?.(i / iterations);',
    '    }',
    '  }',
    '  globalThis.reportProgress?.(1);',
    '  return `∑√n ≈ ${accumulator.toFixed(2)}`;',
    '}',
  ]);
};
