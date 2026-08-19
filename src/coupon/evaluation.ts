import type {
  Env
} from "../env";


interface WinnerRow {
  race_date: string;
  city: string;
  race_number: number;

  coupon_mode: string;
  coupon_horse_numbers_json: string;

  winner_number: number;
}


export async function evaluateCouponStrategies(
  env: Env
): Promise<void> {
  const rows =
    await env.DB.prepare(`
      SELECT
        lr.race_date,
        lr.city,
        lr.race_number,

        lr.coupon_mode,
        lr.coupon_horse_numbers_json,

        lrf.horse_number
          AS winner_number

      FROM learning_races lr

      JOIN learning_runner_features lrf
        ON lrf.race_date =
             lr.race_date
       AND lrf.city =
             lr.city
       AND lrf.race_number =
             lr.race_number

      WHERE
        lr.coupon_mode
          IS NOT NULL

        AND lr.coupon_horse_numbers_json
          IS NOT NULL

        AND lrf.finish_position = 1
    `)
      .all<WinnerRow>();

  const races =
    new Map<
      string,
      {
        mode: string;
        selections: number[];
        winners: Set<number>;
      }
    >();

  for (
    const row of
    rows.results ?? []
  ) {
    const key =
      `${row.race_date}|` +
      `${row.city}|` +
      `${row.race_number}`;

    let selections:
      number[] = [];

    try {
      const parsed =
        JSON.parse(
          row.coupon_horse_numbers_json
        );

      if (
        Array.isArray(parsed)
      ) {
        selections =
          parsed
            .map(Number)
            .filter(
              Number.isFinite
            );
      }
    } catch {
      continue;
    }

    const current =
      races.get(key) ?? {
        mode:
          row.coupon_mode,

        selections,

        winners:
          new Set<number>()
      };

    current.winners.add(
      Number(
        row.winner_number
      )
    );

    races.set(
      key,
      current
    );
  }

  const byMode =
    new Map<
      string,
      {
        races: number;
        covered: number;
        selectionCount: number;
      }
    >();

  for (
    const race of
    races.values()
  ) {
    const state =
      byMode.get(
        race.mode
      ) ?? {
        races: 0,
        covered: 0,
        selectionCount: 0
      };

    state.races += 1;

    state.selectionCount +=
      race.selections.length;

    const covered =
      [...race.winners]
        .some(
          winner =>
            race.selections
              .includes(
                winner
              )
        );

    if (covered) {
      state.covered += 1;
    }

    byMode.set(
      race.mode,
      state
    );
  }

  await env.DB.prepare(`
    DELETE FROM coupon_strategy_metrics
  `).run();

  const now =
    new Date()
      .toISOString();

  for (
    const [
      mode,
      state
    ] of byMode
  ) {
    await env.DB.prepare(`
      INSERT INTO coupon_strategy_metrics(
        mode,

        evaluated_races,
        winner_covered_races,

        hit_rate,
        avg_selection_count,

        updated_at
      )
      VALUES(?,?,?,?,?,?)
    `)
      .bind(
        mode,

        state.races,
        state.covered,

        state.races > 0
          ? state.covered /
            state.races
          : null,

        state.races > 0
          ? state.selectionCount /
            state.races
          : null,

        now
      )
      .run();
  }
}
