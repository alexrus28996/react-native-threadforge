import { ThreadTask, withThreadSource } from './threadHelpers';

type ImageProcessingResult = string;

export const createImageProcessingTask = (): ThreadTask<ImageProcessingResult> => {
  const fn: ThreadTask<ImageProcessingResult> = () => {
    const pixels = 2_000_000;
    let transformed = 0;

    for (let i = 0; i < pixels; i++) {
      transformed += Math.sin(i) * Math.cos(i / 10);
      if (i % 200_000 === 0) {
        globalThis.reportProgress?.(i / pixels);
      }
    }

    globalThis.reportProgress?.(1);
    return `🖼️ Processed ${pixels.toLocaleString()} pixels (score ${transformed.toFixed(2)})`;
  };

  return withThreadSource(fn, [
    '() => {',
    '  const pixels = 2000000;',
    '  let transformed = 0;',
    '  for (let i = 0; i < pixels; i++) {',
    '    transformed += Math.sin(i) * Math.cos(i / 10);',
    '    if (i % 200000 === 0) {',
    '      globalThis.reportProgress?.(i / pixels);',
    '    }',
    '  }',
    '  globalThis.reportProgress?.(1);',
    '  return `🖼️ Processed ${pixels.toLocaleString()} pixels (score ${transformed.toFixed(2)})`;',
    '}',
  ]);
};
