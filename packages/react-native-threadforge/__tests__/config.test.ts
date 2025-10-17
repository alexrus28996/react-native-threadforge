const originalEnv = { ...process.env };

describe('threadforge configuration', () => {
  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  it('uses environment variables for the default thread count', () => {
    process.env = { ...originalEnv, THREADFORGE_DEFAULT_THREAD_COUNT: '6' };

    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { DEFAULT_THREAD_COUNT } = require('../src/config');
      expect(DEFAULT_THREAD_COUNT).toBe(6);
    });
  });

  it('falls back to defaults for invalid progress throttle values', () => {
    process.env = { ...originalEnv, THREADFORGE_PROGRESS_THROTTLE_MS: '-5' };

    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { DEFAULT_PROGRESS_THROTTLE_MS } = require('../src/config');
      expect(DEFAULT_PROGRESS_THROTTLE_MS).toBe(100);
    });
  });
});
