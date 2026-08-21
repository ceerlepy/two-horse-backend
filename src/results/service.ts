import type {
  Env
} from "../env";

import {
  acquireOfficialResults
} from "./acquisition";

import {
  attachMeetingResultsToLearning
} from "./learning-labels";

import {
  rebuildLearningPriors
} from "../learning/priors";

import {
  evaluateLearningModel
} from "../learning/evaluation";

import {
  rebuildExpertCategoryPriors
} from "../learning/expert-category";

import {
  evaluateAdvancedLearning
} from "../learning/advanced-evaluation";

import {
  evaluateCouponStrategies
} from "../coupon/evaluation";


type ResultStageStatus =
  "ok" |
  "error" |
  "skipped";


interface ResultStage {
  status: ResultStageStatus;
  error?: string;
}


interface ResultStages {
  acquisition: ResultStage;
  learningLabel: ResultStage;
  priorRebuild: ResultStage;
  learningEvaluation: ResultStage;
  expertPriorRebuild: ResultStage;
  advancedEvaluation: ResultStage;
  couponEvaluation: ResultStage;
}


interface LabelSummary {
  labelledRaces: number;
  labelledRunners: number;
  skippedRaces: number;
}


function errorMessage(
  error: unknown
): string {
  return error instanceof Error
    ? error.message
    : String(error);
}


function skippedStage():
  ResultStage {
  return {
    status: "skipped"
  };
}


function createInitialStages():
  ResultStages {
  return {
    acquisition:
      skippedStage(),

    learningLabel:
      skippedStage(),

    priorRebuild:
      skippedStage(),

    learningEvaluation:
      skippedStage(),

    expertPriorRebuild:
      skippedStage(),

    advancedEvaluation:
      skippedStage(),

    couponEvaluation:
      skippedStage()
  };
}


async function runOptionalStage(
  stageName: string,
  action: () => Promise<unknown>
): Promise<ResultStage> {
  try {
    await action();

    return {
      status: "ok"
    };
  } catch (error) {
    const message =
      errorMessage(error);

    /*
     * Official results and immutable result labels
     * have already succeeded at this point.
     *
     * A derived-learning or coupon failure must not
     * retroactively mark the official result itself
     * as failed.
     */
    console.warn(
      `[RESULTS] post-processing stage failed: ${stageName}`,
      message
    );

    return {
      status: "error",
      error: message
    };
  }
}


function hasPostProcessingError(
  stages: ResultStages
): boolean {
  return [
    stages.priorRebuild,
    stages.learningEvaluation,
    stages.expertPriorRebuild,
    stages.advancedEvaluation,
    stages.couponEvaluation
  ].some(
    stage =>
      stage.status ===
      "error"
  );
}


async function persistRunSuccess(
  env: Env,
  input: {
    raceDate: string;
    city: string;
    attemptAt: string;
    method: string;
    raceCount: number;
    labels: LabelSummary;
    stages: ResultStages;
  }
): Promise<void> {
  const completedAt =
    new Date()
      .toISOString();

  const postProcessingError =
    hasPostProcessingError(
      input.stages
    );

  await env.DB.prepare(`
    INSERT INTO official_result_runs(
      race_date,
      city,
      last_attempt_at,
      last_success_at,
      method,
      status,
      detail
    )
    VALUES(?,?,?,?,?,?,?)

    ON CONFLICT(
      race_date,
      city
    )
    DO UPDATE SET
      last_attempt_at =
        excluded.last_attempt_at,

      last_success_at =
        excluded.last_success_at,

      method =
        excluded.method,

      status =
        excluded.status,

      detail =
        excluded.detail
  `)
    .bind(
      input.raceDate,
      input.city,
      input.attemptAt,
      completedAt,
      input.method,

      /*
       * "ok" means that official result acquisition
       * and safe label attachment succeeded.
       *
       * Derived post-processing failures are recorded
       * independently in detail.stages.
       */
      postProcessingError
        ? "ok_with_warnings"
        : "ok",

      JSON.stringify({
        raceCount:
          input.raceCount,

        ...input.labels,

        stages:
          input.stages
      })
    )
    .run();
}


async function persistRunFailure(
  env: Env,
  input: {
    raceDate: string;
    city: string;
    attemptAt: string;
    method: string | null;
    error: unknown;
    stages: ResultStages;
  }
): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO official_result_runs(
      race_date,
      city,
      last_attempt_at,
      method,
      status,
      detail
    )
    VALUES(?,?,?,?,?,?)

    ON CONFLICT(
      race_date,
      city
    )
    DO UPDATE SET
      last_attempt_at =
        excluded.last_attempt_at,

      method =
        excluded.method,

      status =
        excluded.status,

      detail =
        excluded.detail
  `)
    .bind(
      input.raceDate,
      input.city,
      input.attemptAt,
      input.method,
      "error",

      JSON.stringify({
        error:
          errorMessage(
            input.error
          ),

        stages:
          input.stages
      })
    )
    .run();
}


export async function ingestOfficialResults(
  env: Env,
  input: {
    url: string;
    city: string;
    raceDate: string;
  }
): Promise<{
  method: string;
  raceCount: number;
  labelledRaces: number;
  labelledRunners: number;
  skippedRaces: number;
  postProcessingWarnings: number;
}> {
  const attemptAt =
    new Date()
      .toISOString();

  const stages =
    createInitialStages();

  let method:
    string | null =
    null;

  try {
    /*
     * CRITICAL STAGE 1:
     * acquire and validate the official result.
     *
     * Failure here means that we do NOT possess a
     * trusted official result and the meeting remains
     * retryable as an error/pending result.
     */
    const acquired =
      await acquireOfficialResults(
        env,
        input
      );

    method =
      acquired.method;

    stages.acquisition = {
      status: "ok"
    };

    /*
     * CRITICAL STAGE 2:
     * attach official outcomes to immutable frozen
     * pre-race learning snapshots.
     *
     * This remains strict and atomic inside the label
     * service. A failure here is a real ingestion
     * failure, not a derived post-processing warning.
     */
    let labels:
      LabelSummary;

    try {
      labels =
        await attachMeetingResultsToLearning(
          env,
          acquired.value
        );

      stages.learningLabel = {
        status: "ok"
      };
    } catch (error) {
      stages.learningLabel = {
        status: "error",
        error:
          errorMessage(error)
      };

      throw error;
    }

    /*
     * Everything below is derived post-processing.
     *
     * Once official acquisition + safe labels have
     * succeeded, these stages must not invalidate the
     * official result run.
     */
    if (
      labels.labelledRunners > 0
    ) {
      stages.priorRebuild =
        await runOptionalStage(
          "prior_rebuild",
          () =>
            rebuildLearningPriors(
              env
            )
        );

      /*
       * Learning evaluation depends on successfully
       * rebuilt priors. Do not evaluate against a
       * knowingly failed rebuild.
       */
      if (
        stages.priorRebuild.status ===
        "ok"
      ) {
        stages.learningEvaluation =
          await runOptionalStage(
            "learning_evaluation",
            () =>
              evaluateLearningModel(
                env
              )
          );
      }

      stages.expertPriorRebuild =
        await runOptionalStage(
          "expert_prior_rebuild",
          () =>
            rebuildExpertCategoryPriors(
              env
            )
        );

      /*
       * Advanced evaluation depends on the derived
       * learning state. Run only if prerequisite
       * learning evaluation succeeded.
       */
      if (
        stages.learningEvaluation.status ===
        "ok"
      ) {
        stages.advancedEvaluation =
          await runOptionalStage(
            "advanced_evaluation",
            () =>
              evaluateAdvancedLearning(
                env
              )
          );
      }

      /*
       * Coupon evaluation is independent from whether
       * the learning prior/model update succeeded.
       *
       * Completed official results should therefore
       * still be allowed to settle persisted coupons.
       */
      stages.couponEvaluation =
        await runOptionalStage(
          "coupon_evaluation",
          () =>
            evaluateCouponStrategies(
              env
            )
        );
    }

    await persistRunSuccess(
      env,
      {
        raceDate:
          input.raceDate,

        city:
          input.city,

        attemptAt,

        method:
          acquired.method,

        raceCount:
          acquired.value.races.length,

        labels,

        stages
      }
    );

    const postProcessingWarnings =
      [
        stages.priorRebuild,
        stages.learningEvaluation,
        stages.expertPriorRebuild,
        stages.advancedEvaluation,
        stages.couponEvaluation
      ].filter(
        stage =>
          stage.status ===
          "error"
      ).length;

    return {
      method:
        acquired.method,

      raceCount:
        acquired.value.races.length,

      ...labels,

      postProcessingWarnings
    };
  } catch (error) {
    /*
     * Only acquisition or safe label-attachment
     * failures reach this path.
     *
     * Derived post-processing failures have already
     * been isolated by runOptionalStage().
     */
    if (
      stages.acquisition.status !==
        "ok"
    ) {
      stages.acquisition = {
        status: "error",
        error:
          errorMessage(error)
      };
    }

    await persistRunFailure(
      env,
      {
        raceDate:
          input.raceDate,

        city:
          input.city,

        attemptAt,

        method,

        error,
        stages
      }
    );

    throw error;
  }
}
