declare module 'sql.js' {
  interface SqlJsStatic {
    Database: new (data?: Buffer | null) => Database;
  }
  interface Database {
    run(sql: string, params?: any): void;
    exec(sql: string): QueryExecResult[];
    prepare(sql: string): Statement;
    export(): Uint8Array;
  }
  interface QueryExecResult {
    columns: string[];
    values: any[][];
  }
  interface Statement {
    bind(params?: any[]): boolean;
    step(): boolean;
    getAsObject(params?: any): Record<string, any>;
    reset(): void;
    free(): boolean;
  }
  export default function initSqlJs(config?: any): Promise<SqlJsStatic>;
}
