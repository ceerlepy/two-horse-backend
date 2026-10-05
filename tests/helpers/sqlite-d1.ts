import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

/*
 * Minimal in-memory D1 stand-in backed by node:sqlite, enough for
 * the prepare/bind/first/all/run/batch calls the membership code
 * makes. Loaded through createRequire because node:sqlite is newer
 * than the bundler's builtin list.
 */
const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite");

export function createSqliteD1(
  migrationFiles: string[]
): any {
  const db = new DatabaseSync(":memory:");

  for (const file of migrationFiles) {
    db.exec(readFileSync(file, "utf8"));
  }

  const prepare = (sql: string) => {
    let params: unknown[] = [];

    const statement: any = {
      bind(...values: unknown[]) {
        params = values.map(v => v === undefined ? null : v);
        return statement;
      },
      async first<T>() {
        return (db.prepare(sql).get(...params) ?? null) as T;
      },
      async all<T>() {
        return { results: db.prepare(sql).all(...params) as T[] };
      },
      async run() {
        const info = db.prepare(sql).run(...params);
        return { success: true, meta: { changes: info.changes } };
      }
    };

    return statement;
  };

  return {
    prepare,
    async batch(statements: any[]) {
      db.exec("BEGIN");
      try {
        for (const s of statements) await s.run();
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    }
  };
}
