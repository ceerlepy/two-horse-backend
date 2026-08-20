import type {
  Env
} from "../env";

import {
  json,
  errorMessage,
  turkeyDate
} from "../shared";

import {
  SCORING_WEIGHTS,
  TOTAL_SCORING_WEIGHT
} from "../scoring/weights";

import {
  MODEL_VERSION,
  LEARNING_POLICY_VERSION,
  COUPON_POLICY_VERSION
} from "../model/version";

function intParam(
  url: URL,
  name: string
): number | null {
  const value =
    Number(
      url.searchParams.get(
        name
      )
    );

  return Number.isInteger(value)
    ? value
    : null;
}

async function count(
  env: Env,
  sql: string,
  ...bindings: unknown[]
): Promise<number> {
  const q =
    env.DB.prepare(
      sql
    );

  const row =
    bindings.length
      ? await q
          .bind(
            ...bindings
          )
          .first<any>()
      : await q
          .first<any>();

  return Number(
    row?.total ??
    0
  );
}

export async function systemDiagnosticResponse(
  request: Request,
  env: Env
): Promise<Response | null> {
  const url =
    new URL(
      request.url
    );

  if (
    url.pathname ===
    "/api/debug/scoring-config"
  ) {
    return json({
      ok: true,
      weights:
        SCORING_WEIGHTS,
      totalWeight:
        TOTAL_SCORING_WEIGHT,
      versions: {
        model:
          MODEL_VERSION,
        learning:
          LEARNING_POLICY_VERSION,
        coupon:
          COUPON_POLICY_VERSION
      }
    });
  }

  if (
    url.pathname ===
    "/api/debug/db/schema"
  ) {
    const result =
      await env.DB.prepare(`
        SELECT
          type,
          name,
          tbl_name,
          sql
        FROM sqlite_master
        WHERE
          name NOT LIKE 'sqlite_%'
        ORDER BY
          type,
          name
      `).all<any>();

    return json({
      ok: true,
      objects:
        result.results
    });
  }

  if (
    url.pathname ===
    "/api/debug/db/counts"
  ) {
    const tables =
      await env.DB.prepare(`
        SELECT name
        FROM sqlite_master
        WHERE
          type='table'
          AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `).all<any>();

    const output = [];

    for (
      const row of
      tables.results ?? []
    ) {
      const name =
        String(
          row.name
        );

      if (
        !/^[A-Za-z_][A-Za-z0-9_]*$/
          .test(
            name
          )
      ) {
        continue;
      }

      try {
        const r =
          await env.DB.prepare(
            'SELECT COUNT(*) total FROM "' +
            name +
            '"'
          )
            .first<any>();

        output.push({
          table:
            name,
          rows:
            Number(
              r?.total ??
              0
            )
        });

      } catch (error) {
        output.push({
          table:
            name,
          rows: null,
          error:
            errorMessage(
              error
            )
        });
      }
    }

    return json({
      ok: true,
      counts:
        output
    });
  }

  if (
    url.pathname ===
    "/api/debug/card"
  ) {
    const date =
      url.searchParams.get(
        "date"
      ) ??
      turkeyDate();

    const races =
      await env.DB.prepare(`
        SELECT
          city,
          COUNT(*) race_count,
          MIN(race_number) first_race,
          MAX(race_number) last_race,
          MIN(starts_at) first_start,
          MAX(starts_at) last_start
        FROM races
        WHERE race_date=?
        GROUP BY city
        ORDER BY city
      `)
        .bind(
          date
        )
        .all<any>();

    const runners =
      await env.DB.prepare(`
        SELECT
          city,
          COUNT(*) runner_count
        FROM runners
        WHERE race_date=?
        GROUP BY city
        ORDER BY city
      `)
        .bind(
          date
        )
        .all<any>();

    return json({
      ok: true,
      date,
      races:
        races.results,
      runners:
        runners.results
    });
  }

  if (
    url.pathname ===
    "/api/debug/race"
  ) {
    const date =
      url.searchParams.get(
        "date"
      ) ??
      turkeyDate();

    const city =
      String(
        url.searchParams.get(
          "city"
        ) ??
        ""
      );

    const race =
      intParam(
        url,
        "race"
      );

    if (
      !city ||
      race == null
    ) {
      return json(
        {
          ok: false,
          error:
            "CITY_AND_RACE_REQUIRED"
        },
        400
      );
    }

    const raceRow =
      await env.DB.prepare(`
        SELECT *
        FROM races
        WHERE
          race_date=?
          AND city=?
          AND race_number=?
      `)
        .bind(
          date,
          city,
          race
        )
        .first<any>();

    const runners =
      await env.DB.prepare(`
        SELECT *
        FROM runners
        WHERE
          race_date=?
          AND city=?
          AND race_number=?
        ORDER BY horse_number
      `)
        .bind(
          date,
          city,
          race
        )
        .all<any>();

    return json({
      ok:
        raceRow != null,
      race:
        raceRow ??
        null,
      runners:
        runners.results
    });
  }

  if (
    url.pathname ===
    "/api/debug/runner"
  ) {
    const date =
      url.searchParams.get(
        "date"
      ) ??
      turkeyDate();

    const city =
      String(
        url.searchParams.get(
          "city"
        ) ??
        ""
      );

    const race =
      intParam(
        url,
        "race"
      );

    const horse =
      intParam(
        url,
        "horse"
      );

    if (
      !city ||
      race == null ||
      horse == null
    ) {
      return json(
        {
          ok: false,
          error:
            "CITY_RACE_HORSE_REQUIRED"
        },
        400
      );
    }

    const runner =
      await env.DB.prepare(`
        SELECT *
        FROM runners
        WHERE
          race_date=?
          AND city=?
          AND race_number=?
          AND horse_number=?
      `)
        .bind(
          date,
          city,
          race,
          horse
        )
        .first<any>();

    const experts =
      await env.DB.prepare(`
        SELECT *
        FROM expert_predictions
        WHERE
          race_date=?
          AND city=?
          AND race_number=?
          AND horse_number=?
        ORDER BY source_key
      `)
        .bind(
          date,
          city,
          race,
          horse
        )
        .all<any>();

    const market =
      await env.DB.prepare(`
        SELECT *
        FROM agf_market_snapshots
        WHERE
          race_date=?
          AND city=?
          AND race_number=?
          AND horse_number=?
        ORDER BY captured_at DESC
        LIMIT 20
      `)
        .bind(
          date,
          city,
          race,
          horse
        )
        .all<any>();

    const field =
      await env.DB.prepare(`
        SELECT *
        FROM field_signals
        WHERE
          race_date=?
          AND city=?
          AND race_number=?
          AND horse_number=?
      `)
        .bind(
          date,
          city,
          race,
          horse
        )
        .all<any>();

    return json({
      ok:
        runner != null,
      runner:
        runner ??
        null,
      experts:
        experts.results,
      market:
        market.results,
      field:
        field.results
    });
  }

  if (
    url.pathname ===
    "/api/debug/invariants"
  ) {
    const invalidCaptureTiming =
      await count(
        env,
        `
          SELECT COUNT(*) total
          FROM learning_snapshot_candidates
          WHERE captured_at >= starts_at
        `
      );

    const orphanRunners =
      await count(
        env,
        `
          SELECT COUNT(*) total
          FROM runners r
          LEFT JOIN races rc
            ON rc.race_date=r.race_date
           AND rc.city=r.city
           AND rc.race_number=r.race_number
          WHERE rc.race_number IS NULL
        `
      );

    const duplicateWindows =
      await count(
        env,
        `
          SELECT COUNT(*) total
          FROM (
            SELECT
              race_date,
              city,
              sixfold_number
            FROM sixfold_windows
            GROUP BY
              race_date,
              city,
              sixfold_number
            HAVING COUNT(*) > 1
          )
        `
      );

    return json({
      ok:
        invalidCaptureTiming === 0 &&
        orphanRunners === 0 &&
        duplicateWindows === 0,
      checks: {
        invalidCaptureTiming,
        orphanRunners,
        duplicateWindows
      }
    });
  }

  if (
    url.pathname ===
    "/api/debug/health/deep"
  ) {
    try {
      await env.DB.prepare(
        "SELECT 1"
      ).first();

      const degradedSources =
        await count(
          env,
          `
            SELECT COUNT(*) total
            FROM source_registry
            WHERE
              enabled=1
              AND health_status <> 'healthy'
          `
        );

      const invalidCaptureTiming =
        await count(
          env,
          `
            SELECT COUNT(*) total
            FROM learning_snapshot_candidates
            WHERE captured_at >= starts_at
          `
        );

      return json({
        ok: true,
        status:
          invalidCaptureTiming > 0
            ? "degraded"
            : "healthy",
        database:
          "healthy",
        degradedSources,
        invalidCaptureTiming,
        serverNow:
          new Date()
            .toISOString()
      });

    } catch (error) {
      return json(
        {
          ok: false,
          status:
            "unhealthy",
          error:
            errorMessage(
              error
            )
        },
        500
      );
    }
  }

  return null;
}
