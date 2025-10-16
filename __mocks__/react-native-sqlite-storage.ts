const createRows = () => ({
  length: 0,
  item: () => ({}),
  raw: [] as Array<Record<string, unknown>>,
});

const createResultSet = () => ({
  rows: createRows(),
  rowsAffected: 0,
});

const createTransaction = () => ({
  executeSql: jest.fn((sql: string, params?: unknown[], onSuccess?: (tx: unknown, result: unknown) => void) => {
    if (onSuccess) {
      onSuccess({}, createResultSet());
    }
  }),
});

const createDatabase = () => ({
  executeSql: jest.fn(async () => [createResultSet()]),
  transaction: jest.fn((callback: (tx: ReturnType<typeof createTransaction>) => void, onError?: (error: Error) => void, onSuccess?: () => void) => {
    try {
      const tx = createTransaction();
      callback(tx);
      onSuccess?.();
    } catch (error) {
      onError?.(error as Error);
    }
  }),
  close: jest.fn(async () => {}),
});

const SQLite = {
  enablePromise: jest.fn(),
  openDatabase: jest.fn(async () => createDatabase()),
  deleteDatabase: jest.fn(async () => {}),
};

export const SQLiteDatabase = {} as unknown;
export const Transaction = {} as unknown;

export default SQLite;
