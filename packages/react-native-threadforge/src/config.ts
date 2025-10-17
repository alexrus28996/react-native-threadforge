const getEnv = (key: string): string | undefined => {
  if (typeof process === 'undefined') {
    return undefined;
  }

  return process.env?.[key];
};

const parseNumber = (rawValue: string | undefined, fallback: number, { min }: { min?: number } = {}) => {
  if (typeof rawValue !== 'string') {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  if (typeof min === 'number' && parsed < min) {
    return fallback;
  }

  return parsed;
};

export const DEFAULT_THREAD_COUNT = parseNumber(
  getEnv('THREADFORGE_DEFAULT_THREAD_COUNT'),
  4,
  { min: 1 },
);

export const DEFAULT_PROGRESS_THROTTLE_MS = parseNumber(
  getEnv('THREADFORGE_PROGRESS_THROTTLE_MS'),
  100,
  { min: 0 },
);

export type ThreadForgeConfig = {
  defaultThreadCount: number;
  progressThrottleMs: number;
};

export const threadForgeConfig: ThreadForgeConfig = {
  defaultThreadCount: DEFAULT_THREAD_COUNT,
  progressThrottleMs: DEFAULT_PROGRESS_THROTTLE_MS,
};
