import type {
  Env
} from "../env";

import {
  HORSE_VIDEO_CONFIG,
  fetchLast3HorseVideos,
  type HorseRaceVideo
} from "./video-archive";


export type HorseVideoResult =
  | { videos: HorseRaceVideo[]; fetchedAt: string }
  | { error: "NO_PROFILE_URL" };


export async function getHorseVideos(
  env: Env,
  raceDate: string,
  city: string,
  raceNumber: number,
  horseNumber: number
): Promise<HorseVideoResult> {
  const cached =
    await env.DB.prepare(`
      SELECT videos_json, fetched_at
      FROM horse_video_cache
      WHERE race_date = ? AND city = ? AND race_number = ? AND horse_number = ?
    `)
      .bind(raceDate, city, raceNumber, horseNumber)
      .first<{ videos_json: string; fetched_at: string }>();

  if (cached) {
    const ageMs =
      Date.now() - new Date(cached.fetched_at).getTime();

    if (ageMs < HORSE_VIDEO_CONFIG.cacheTtlHours * 3_600_000) {
      return {
        videos: JSON.parse(cached.videos_json),
        fetchedAt: cached.fetched_at
      };
    }
  }

  const runner =
    await env.DB.prepare(`
      SELECT horse_profile_url
      FROM runners
      WHERE race_date = ? AND city = ? AND race_number = ? AND horse_number = ?
    `)
      .bind(raceDate, city, raceNumber, horseNumber)
      .first<{ horse_profile_url: string | null }>();

  if (!runner?.horse_profile_url) {
    return { error: "NO_PROFILE_URL" };
  }

  const videos =
    await fetchLast3HorseVideos(runner.horse_profile_url);

  const fetchedAt = new Date().toISOString();

  await env.DB.prepare(`
    INSERT INTO horse_video_cache(
      race_date, city, race_number, horse_number, videos_json, fetched_at
    )
    VALUES(?,?,?,?,?,?)
    ON CONFLICT(race_date, city, race_number, horse_number)
    DO UPDATE SET
      videos_json = excluded.videos_json,
      fetched_at = excluded.fetched_at
  `)
    .bind(
      raceDate,
      city,
      raceNumber,
      horseNumber,
      JSON.stringify(videos),
      fetchedAt
    )
    .run();

  return { videos, fetchedAt };
}
