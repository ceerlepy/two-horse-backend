import type {
  Env
} from "../env";


export interface LearningCandidate {
  raceDate: string;
  city: string;
  raceNumber: number;

  startsAt: string;
  capturedAt: string;

  snapshot: unknown;
}


/*
 * Keep ONLY the latest canonical snapshot that was
 * genuinely observed before race start.
 *
 * An after-start invocation can never overwrite it.
 */
export async function upsertLearningCandidate(
  env: Env,
  candidate: LearningCandidate
): Promise<boolean> {
  const captured =
    Date.parse(
      candidate.capturedAt
    );

  const starts =
    Date.parse(
      candidate.startsAt
    );

  if (
    !Number.isFinite(captured) ||
    !Number.isFinite(starts) ||
    captured >= starts
  ) {
    return false;
  }

  await env.DB.prepare(`
    INSERT INTO learning_snapshot_candidates(
      race_date,
      city,
      race_number,
      starts_at,
      captured_at,
      snapshot_json
    )
    VALUES(?,?,?,?,?,?)

    ON CONFLICT(
      race_date,
      city,
      race_number
    )
    DO UPDATE SET
      starts_at =
        excluded.starts_at,

      captured_at =
        excluded.captured_at,

      snapshot_json =
        excluded.snapshot_json

    WHERE
      excluded.captured_at <
        excluded.starts_at

      AND excluded.captured_at >
        learning_snapshot_candidates.captured_at
  `)
    .bind(
      candidate.raceDate,
      candidate.city,
      candidate.raceNumber,
      candidate.startsAt,
      candidate.capturedAt,
      JSON.stringify(
        candidate.snapshot
      )
    )
    .run();

  return true;
}


export async function deleteLearningCandidate(
  env: Env,
  input: {
    raceDate: string;
    city: string;
    raceNumber: number;
  }
): Promise<void> {
  await env.DB.prepare(`
    DELETE FROM learning_snapshot_candidates

    WHERE
      race_date = ?
      AND city = ?
      AND race_number = ?
  `)
    .bind(
      input.raceDate,
      input.city,
      input.raceNumber
    )
    .run();
}
