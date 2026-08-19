import type {
  Env
} from "../env";


interface SnapshotRow {
  horse_number: number;
  agf_percent: number;
  captured_at: string;
}


export interface LearningMarketFeatures {
  t90: number | null;
  t30: number | null;
  t5: number | null;
  final: number | null;

  maxRise: number | null;
  maxFall: number | null;
}


function latestAtOrBefore(
  points: SnapshotRow[],
  target: number
): number | null {
  let best:
    SnapshotRow | null =
    null;

  for (
    const point of points
  ) {
    const timestamp =
      Date.parse(
        point.captured_at
      );

    if (
      !Number.isFinite(timestamp) ||
      timestamp > target
    ) {
      continue;
    }

    if (
      best == null ||
      timestamp >
        Date.parse(
          best.captured_at
        )
    ) {
      best = point;
    }
  }

  return best == null
    ? null
    : Number(
        best.agf_percent
      );
}


export async function loadRaceMarketFeatures(
  env: Env,
  input: {
    raceDate: string;
    city: string;
    raceNumber: number;

    startsAt: string;

    /*
     * Hard information boundary.
     *
     * No market observation later than this timestamp
     * can enter this training feature set.
     */
    cutoffAt: string;
  }
): Promise<
  Map<
    number,
    LearningMarketFeatures
  >
> {
  const raceTime =
    Date.parse(
      input.startsAt
    );

  const cutoffTime =
    Math.min(
      raceTime,
      Date.parse(
        input.cutoffAt
      )
    );

  if (
    !Number.isFinite(raceTime) ||
    !Number.isFinite(cutoffTime)
  ) {
    throw new Error(
      "LEARNING_INVALID_MARKET_CUTOFF"
    );
  }

  const rows =
    await env.DB.prepare(`
      SELECT
        horse_number,
        agf_percent,
        captured_at

      FROM agf_market_snapshots

      WHERE
        race_date = ?
        AND city = ?
        AND race_number = ?

        AND captured_at <= ?

      ORDER BY
        horse_number,
        captured_at
    `)
      .bind(
        input.raceDate,
        input.city,
        input.raceNumber,
        input.cutoffAt
      )
      .all<SnapshotRow>();

  const byHorse =
    new Map<
      number,
      SnapshotRow[]
    >();

  for (
    const row of
    rows.results ?? []
  ) {
    const timestamp =
      Date.parse(
        row.captured_at
      );

    const agf =
      Number(
        row.agf_percent
      );

    if (
      !Number.isFinite(timestamp) ||
      timestamp >
        cutoffTime ||
      !Number.isFinite(agf)
    ) {
      continue;
    }

    const points =
      byHorse.get(
        Number(
          row.horse_number
        )
      ) ?? [];

    points.push({
      horse_number:
        Number(
          row.horse_number
        ),

      agf_percent:
        agf,

      captured_at:
        row.captured_at
    });

    byHorse.set(
      Number(
        row.horse_number
      ),
      points
    );
  }

  const result =
    new Map<
      number,
      LearningMarketFeatures
    >();

  for (
    const [
      horseNumber,
      points
    ] of byHorse
  ) {
    points.sort(
      (a, b) =>
        Date.parse(
          a.captured_at
        ) -
        Date.parse(
          b.captured_at
        )
    );

    const final =
      latestAtOrBefore(
        points,
        cutoffTime
      );

    const t90 =
      latestAtOrBefore(
        points,
        Math.min(
          cutoffTime,
          raceTime -
            90 * 60_000
        )
      );

    const t30 =
      cutoffTime >=
        raceTime -
          30 * 60_000
        ? latestAtOrBefore(
            points,
            raceTime -
              30 * 60_000
          )
        : null;

    const t5 =
      cutoffTime >=
        raceTime -
          5 * 60_000
        ? latestAtOrBefore(
            points,
            raceTime -
              5 * 60_000
          )
        : null;

    const window =
      points.filter(
        point => {
          const timestamp =
            Date.parse(
              point.captured_at
            );

          return (
            timestamp >=
              raceTime -
                90 * 60_000 &&
            timestamp <=
              cutoffTime
          );
        }
      );

    const first =
      window[0]
        ?.agf_percent ??
      null;

    const deltas =
      first == null
        ? []
        : window.map(
            point =>
              point.agf_percent -
              first
          );

    result.set(
      horseNumber,
      {
        t90,
        t30,
        t5,
        final,

        maxRise:
          deltas.length
            ? Math.max(
                ...deltas
              )
            : null,

        maxFall:
          deltas.length
            ? Math.min(
                ...deltas
              )
            : null
      }
    );
  }

  return result;
}
