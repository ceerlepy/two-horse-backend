import type {
  Env
} from "../../env";

import {
  errorMessage
} from "../../shared";

export function validIdentifier(
  value: string
): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/
    .test(value);
}

export function boundedLimit(
  value: string | null,
  fallback = 50,
  maximum = 100
): number {
  const parsed =
    Number(
      value ??
      String(fallback)
    );

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(
    1,
    Math.min(
      maximum,
      Math.floor(parsed)
    )
  );
}

export async function tableNames(
  env: Env
): Promise<string[]> {
  const rows =
    await env.DB.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE
        type = 'table'
        AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all<any>();

  return (
    rows.results ??
    []
  )
    .map(
      row =>
        String(row.name)
    )
    .filter(validIdentifier);
}

export async function scalarCount(
  env: Env,
  sql: string,
  ...bindings: unknown[]
): Promise<number> {
  try {
    const statement =
      env.DB.prepare(sql);

    const row =
      bindings.length
        ? await statement
            .bind(...bindings)
            .first<any>()
        : await statement
            .first<any>();

    return Number(
      row?.total ??
      0
    );
  } catch {
    return 0;
  }
}

export async function databaseCounts(
  env: Env
) {
  const tables =
    await tableNames(env);

  const output:
  Array<{
    table: string;
    rows: number | null;
    error?: string;
  }> = [];

  for (const table of tables) {
    try {
      const row =
        await env.DB.prepare(
          'SELECT COUNT(*) total FROM "' +
          table +
          '"'
        ).first<any>();

      output.push({
        table,
        rows:
          Number(
            row?.total ??
            0
          )
      });
    } catch (error) {
      output.push({
        table,
        rows: null,
        error:
          errorMessage(error)
      });
    }
  }

  return output;
}
