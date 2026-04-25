declare module "node:sqlite" {
  export class DatabaseSync {
    constructor(filename: string);
    exec(sql: string): void;
    prepare(sql: string): {
      all: (...values: unknown[]) => unknown[];
      get: (...values: unknown[]) => unknown;
      run: (...values: unknown[]) => {
        changes: number;
      };
    };
  }
}
