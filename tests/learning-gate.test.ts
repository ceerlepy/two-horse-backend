import {
  describe,
  expect,
  it
} from "vitest";

import {
  computeLearningGateOutcome,
  LEARNING_GATE_CONFIG
} from "../src/learning/evaluation";


function metrics(
  overrides: Partial<
    Parameters<typeof computeLearningGateOutcome>[0]
  > = {}
) {
  return {
    races: LEARNING_GATE_CONFIG.minGateRaces,
    baseTop1: 0.30,
    learnedTop1: 0.30,
    baseTop3: 0.55,
    learnedTop3: 0.55,
    baseRank: 3.0,
    learnedRank: 3.0,
    ...overrides
  };
}


describe(
  "computeLearningGateOutcome",
  () => {
    it(
      "stays insufficient-data below the race-count gate, regardless of metrics",
      () => {
        const outcome =
          computeLearningGateOutcome(
            metrics({
              races: LEARNING_GATE_CONFIG.minGateRaces - 1,
              learnedTop1: 0.99,
              learnedRank: 1.0
            })
          );

        expect(outcome).toEqual({
          scale: LEARNING_GATE_CONFIG.scales.insufficientData,
          status: "insufficient-data"
        });
      }
    );

    it(
      "is healthy once past the gate with no meaningful regression",
      () => {
        const outcome =
          computeLearningGateOutcome(metrics());

        expect(outcome).toEqual({
          scale: LEARNING_GATE_CONFIG.scales.healthy,
          status: "healthy"
        });
      }
    );

    it(
      "degrades only when both the top1 delta AND the rank gain cross their thresholds",
      () => {
        const bothCross =
          computeLearningGateOutcome(
            metrics({
              learnedTop1: 0.30 - 0.03,
              learnedRank: 3.0 + 0.20
            })
          );

        expect(bothCross.status).toBe("learning-degraded");
        expect(bothCross.scale).toBe(
          LEARNING_GATE_CONFIG.scales.degraded
        );

        // top1Delta crosses but rankGain does not -- must not degrade
        const onlyOneCrosses =
          computeLearningGateOutcome(
            metrics({
              learnedTop1: 0.30 - 0.03,
              learnedRank: 3.0
            })
          );

        expect(onlyOneCrosses.status).not.toBe("learning-degraded");
      }
    );

    it(
      "reduces (not degrades) on a smaller top3/rank regression",
      () => {
        const outcome =
          computeLearningGateOutcome(
            metrics({
              learnedTop3: 0.55 - 0.04,
              learnedRank: 3.0 + 0.15
            })
          );

        expect(outcome).toEqual({
          scale: LEARNING_GATE_CONFIG.scales.reduced,
          status: "learning-reduced"
        });
      }
    );

    it(
      "prefers degraded over reduced when both sets of conditions hold",
      () => {
        const outcome =
          computeLearningGateOutcome(
            metrics({
              learnedTop1: 0.30 - 0.05,
              learnedTop3: 0.55 - 0.05,
              learnedRank: 3.0 + 0.30
            })
          );

        expect(outcome.status).toBe("learning-degraded");
      }
    );
  }
);
