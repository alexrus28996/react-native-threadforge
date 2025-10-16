declare module 'react-native-sqlite-storage' {
  export type ResultSetRow = Record<string, unknown>;

  export type ResultSet = {
    rows: {
      length: number;
      item: (index: number) => ResultSetRow;
      raw: ResultSetRow[];
    };
    insertId?: number;
    rowsAffected: number;
  };

  export type Transaction = {
    executeSql: (
      sqlStatement: string,
      args?: unknown[],
      callback?: (transaction: Transaction, resultSet: ResultSet) => void,
      errorCallback?: (transaction: Transaction, error: Error) => void,
    ) => void;
  };

  export type TransactionErrorCallback = (error: Error) => void;
  export type TransactionSuccessCallback = () => void;

  export interface SQLiteDatabase {
    executeSql: (sqlStatement: string, params?: unknown[]) => Promise<ResultSet[]>;
    transaction: (
      callback: (transaction: Transaction) => void,
      errorCallback?: TransactionErrorCallback,
      successCallback?: TransactionSuccessCallback,
    ) => Promise<void> | void;
    close: () => Promise<void>;
  }

  export interface OpenDatabaseParams {
    name: string;
    location?: 'default' | 'Library' | 'Documents';
  }

  export type OpenDatabase = (
    params: OpenDatabaseParams,
    success?: (database: SQLiteDatabase) => void,
    error?: (error: Error) => void,
  ) => Promise<SQLiteDatabase> | SQLiteDatabase;

  const SQLite: {
    openDatabase: OpenDatabase;
    deleteDatabase: (name: string) => Promise<void>;
    enablePromise?: (enable: boolean) => void;
    DEBUG?: (enable: boolean) => void;
  };

  export default SQLite;
}
