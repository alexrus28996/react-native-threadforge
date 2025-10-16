import { ThreadTask, withThreadSource } from './threadHelpers';

type InstantMessageResult = string;

export const createInstantMessageTask = (message: string): ThreadTask<InstantMessageResult> => {
  const fn: ThreadTask<InstantMessageResult> = () => {
    globalThis.reportProgress?.(1);
    return message;
  };

  return withThreadSource(fn, [
    '() => {',
    '  globalThis.reportProgress?.(1);',
    `  return ${JSON.stringify(message)};`,
    '}',
  ]);
};
