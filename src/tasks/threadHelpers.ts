export type ThreadTask<T> = (() => T) & { __threadforgeSource?: string };

export const withThreadSource = <T>(fn: ThreadTask<T>, sourceLines: string[]): ThreadTask<T> => {
  Object.defineProperty(fn, '__threadforgeSource', {
    value: sourceLines.join('\n'),
    enumerable: false,
    configurable: true,
  });
  return fn;
};

declare global {
  // ThreadForge injects a global `reportProgress` function inside worker contexts.
  // We declare it here so TypeScript understands the symbol.
  var reportProgress: ((progress: number) => void) | undefined;
}
