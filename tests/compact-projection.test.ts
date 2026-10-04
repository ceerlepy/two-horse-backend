import {
  describe,
  expect,
  it
} from "vitest";

import {
  toCompactMeetings
} from "../src/api/compact-projection";

import {
  toPublicMeetings
} from "../src/api/public-projection";

function fullRunner(
  horseNumber: number
) {
  return {
    race_date: "2026-10-04",
    city: "İstanbul",
    race_number: 3,
    horse_number: horseNumber,
    horse_name: "ÖRNEK AT",
    jockey: "A. KURŞUN",
    weight: 57.5,
    hp: 84,
    agf_percent: 12.345678901234,
    recent_form_raw: "1 3 2 5 4 1",
    horse_profile_url:
      "https://example.test/AtIstatistikleri?QueryParameter_AtId=123456",
    jockey_profile_url:
      "https://example.test/JokeyIstatistikleri?QueryParameter_JokeyId=987",
    horse_id: "tjk:123456",
    jockey_id: "tjk:987",
    updated_at: "2026-10-04 09:12:33",

    marketMovement: {
      score: 0.61234567891234,
      sampleSize: 6,
      firstAgf: 10.1,
      latestAgf: 12.345678901234,
      absoluteDelta: 2.245678901234,
      relativeDelta: 0.222344445678,
      spanMinutes: 74.5,
      direction: "up"
    },
    market_score: 0.61234567891234,

    fieldSignal: {
      score: 0.5512345678,
      tjkScore: 0.5212345678,
      expertScore: 0.6012345678,
      tjkSampleSize: 4,
      tjkWeight: 0.7,
      expertWeight: 0.3
    },
    field_score: 0.5512345678,

    expertConsensus: {
      sourceCount: 5,
      bankoCount: 1,
      favoriteCount: 2,
      strongCount: 1,
      starCount: 0,
      rivalCount: 1,
      surpriseCount: 0,
      avoidCount: 0,
      weightedBanko: 0.73456789,
      weightedFavorite: 1.23456789,
      weightedStrong: 0.53456789,
      weightedStar: 0,
      weightedRival: 0.43456789,
      weightedSurprise: 0,
      weightedAvoid: 0,
      weightedSupport: 2.50370367,
      weightedOpposition: 0,
      bankoScore: 20.123456789,
      favoriteScore: 40.123456789,
      strongScore: 20.123456789,
      starScore: 0,
      rivalScore: 20.123456789,
      surpriseScore: 0,
      avoidScore: 0,
      expertScore: 71.987654321,
      supportConfidence: 0.81234567,
      labels: ["banko", "favori"],
      summary: "5 uzmanın 1'i banko, 2'si favori gösteriyor."
    },

    modelScore: {
      score: 64.123456789,
      baseScore: 63.987654321,
      learningAdjustment: 0.135802468,
      confidence: 0.912345678,
      availableWeight: 0.95,
      configuredWeight: 1,
      components: [
        "agf",
        "expert",
        "form",
        "hp",
        "market",
        "weight",
        "field"
      ].map(key => ({
        key,
        score: 55.123456789,
        configuredWeight: 0.15,
        effectiveWeight: 0.157894736842
      }))
    }
  };
}

function meetings() {
  return [
    {
      city: "İstanbul",

      races: [
        {
          race_date: "2026-10-04",
          city: "İstanbul",
          race_number: 3,
          start_time: "14:30",
          starts_at: "2026-10-04T11:30:00Z",
          distance_meters: 1400,
          track: "Kum",
          performance_url:
            "https://example.test/AtPerformans?x=1",
          sixfold_start_numbers_json: "[1]",
          fivefold_start_numbers_json: "[2]",
          updated_at: "2026-10-04 09:12:33",

          uncertainty: {
            level: "medium",
            score: 0.4123456789,
            topMargin: 3.123456789,
            leaderScore: 64.123456789,
            secondScore: 61.000000001,
            expansionPressure: 0.5123456789
          },

          couponStrategy: {
            mode: "cover",
            horseNumbers: [1, 4, 7],
            confidence: 0.6123456789,
            expansionPressure: 0.5123456789,
            reason: "Lider ile ikinci arası dar."
          },

          runners:
            Array.from(
              { length: 12 },
              (_, i) => fullRunner(i + 1)
            )
        }
      ]
    }
  ];
}

describe(
  "compact /api/today projection",
  () => {
    it(
      "keeps every field the Android parser reads",
      () => {
        const [meeting] =
          toCompactMeetings(
            toPublicMeetings(
              meetings()
            )
          );

        const race =
          meeting.races[0];

        const runner =
          race.runners[0];

        expect(meeting.city).toBe("İstanbul");
        expect(race.race_number).toBe(3);
        expect(race.starts_at).toBe("2026-10-04T11:30:00Z");
        expect(race.distance_meters).toBe(1400);
        expect(race.track).toBe("Kum");
        expect(race.uncertainty.level).toBe("medium");
        expect(race.couponStrategy.horseNumbers).toEqual([1, 4, 7]);
        expect(race.couponStrategy.reason).toBe("Lider ile ikinci arası dar.");

        expect(runner).toMatchObject({
          horse_number: 1,
          horse_name: "ÖRNEK AT",
          jockey: "A. KURŞUN",
          weight: 57.5,
          hp: 84,
          agf_percent: 12.3457,
          recent_form_raw: "1 3 2 5 4 1"
        });

        expect(runner.modelScore).toEqual({
          score: 64.1235,
          confidence: 0.9123,
          baseScore: 63.9877,
          learningAdjustment: 0.1358,
          components: expect.any(Array)
        });

        expect(runner.modelScore.components).toHaveLength(7);
        expect(runner.modelScore.components[0]).toEqual({
          key: "agf",
          score: 55.1235,
          configuredWeight: 0.15,
          effectiveWeight: 0.1579
        });

        expect(runner.expertConsensus.labels).toEqual(["banko", "favori"]);
        expect(runner.expertConsensus.summary).toContain("banko");
        expect(runner.expertConsensus.expertScore).toBe(71.9877);
        expect(runner.expertConsensus.bankoCount).toBe(1);
        expect("weightedBanko" in runner.expertConsensus).toBe(false);

        expect(runner.marketMovement.direction).toBe("up");
        expect(runner.marketMovement.sampleSize).toBe(6);
        expect(runner.fieldSignal).toEqual({
          score: 0.5512,
          tjkScore: 0.5212,
          expertScore: 0.6012,
          tjkSampleSize: 4
        });
      }
    );

    it(
      "drops only fields the app never reads",
      () => {
        const runner =
          toCompactMeetings(
            toPublicMeetings(
              meetings()
            )
          )[0].races[0].runners[0];

        for (
          const key of [
            "race_date",
            "city",
            "race_number",
            "horse_profile_url",
            "jockey_profile_url",
            "horse_id",
            "jockey_id",
            "updated_at",
            "market_score",
            "field_score"
          ]
        ) {
          expect(key in runner).toBe(false);
        }
      }
    );

    it(
      "does not invent keys a runner never had",
      () => {
        const runner =
          toCompactMeetings([
            {
              city: "Adana",
              races: [
                {
                  race_number: 1,
                  runners: [
                    {
                      horse_number: 7,
                      horse_name: "TEST"
                    }
                  ]
                }
              ]
            }
          ])[0].races[0].runners[0];

        expect(runner).toEqual({
          horse_number: 7,
          horse_name: "TEST"
        });
      }
    );

    it(
      "keeps free-tier redaction intact",
      () => {
        const runner =
          toCompactMeetings(
            toPublicMeetings(
              meetings(),
              "free"
            )
          )[0].races[0].runners[0];

        expect("modelScore" in runner).toBe(false);
        expect("expertConsensus" in runner).toBe(false);
        expect("marketMovement" in runner).toBe(false);
        expect("fieldSignal" in runner).toBe(false);
        expect(runner.horse_name).toBe("ÖRNEK AT");
      }
    );

    it(
      "cuts a realistic premium race payload by at least a third",
      () => {
        const full =
          JSON.stringify(
            toPublicMeetings(
              meetings()
            )
          ).length;

        const compact =
          JSON.stringify(
            toCompactMeetings(
              toPublicMeetings(
                meetings()
              )
            )
          ).length;

        expect(compact / full).toBeLessThan(0.67);
      }
    );
  }
);
