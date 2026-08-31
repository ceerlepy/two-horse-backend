import type {
  Env
} from "./env";

import {
  route
} from "./api/router";

import {
  refreshProgramIfDue
} from "./tjk/program-service";

import {
  refreshExpertsIfDue
} from "./experts/service";

import {
  cleanup,
  finalizeStartedRaces
} from "./history/service";

import {
  cleanupMarketSnapshots
} from "./market/repository";

import {
  refreshFieldSignalsIfDue
} from "./field/service";

import {
  capturePreRaceCandidates,
  promoteStartedCandidates
} from "./learning/snapshot-service";

import {
  cleanupLearning
} from "./learning/retention";

import {
  ingestOfficialResultsDue
} from "./results/runtime";

import {
  evaluatePendingSixFoldCoupons,
  evaluatePendingFiveFoldCoupons
} from "./coupons/repository";

import {
  recalibrateSixFoldProbabilities,
  recalibrateFiveFoldProbabilities
} from "./coupons/calibration";

import {
  logger,
  observed
} from "./observability/logger";


async function runScheduledPipeline(
  env: Env
): Promise<void> {
  const started =
    Date.now();

  await observed(
    env,
    "program.refresh",
    () =>
      refreshProgramIfDue(
        env
      )
  );

  await observed(
    env,
    "experts.refresh",
    () =>
      refreshExpertsIfDue(
        env
      )
  );

  await observed(
    env,
    "field.refresh",
    () =>
      refreshFieldSignalsIfDue(
        env
      )
  );

  await observed(
    env,
    "learning.capture-pre-race",
    () =>
      capturePreRaceCandidates(
        env
      )
  );

  await observed(
    env,
    "learning.promote-started",
    () =>
      promoteStartedCandidates(
        env
      )
  );

  await observed(
    env,
    "history.finalize-started",
    () =>
      finalizeStartedRaces(
        env
      )
  );

  await observed(
    env,
    "results.ingest-official",
    () =>
      ingestOfficialResultsDue(
        env
      )
  );

  await observed(
    env,
    "coupons.evaluate",
    () =>
      evaluatePendingSixFoldCoupons(
        env
      )
  );

  await observed(
    env,
    "coupons.recalibrate",
    () =>
      recalibrateSixFoldProbabilities(
        env
      )
  );

  await observed(
    env,
    "coupons.evaluate.fivefold",
    () =>
      evaluatePendingFiveFoldCoupons(
        env
      )
  );

  await observed(
    env,
    "coupons.recalibrate.fivefold",
    () =>
      recalibrateFiveFoldProbabilities(
        env
      )
  );

  await observed(
    env,
    "market.cleanup",
    () =>
      cleanupMarketSnapshots(
        env
      )
  );

  await observed(
    env,
    "learning.cleanup",
    () =>
      cleanupLearning(
        env
      )
  );

  await observed(
    env,
    "history.cleanup",
    () =>
      cleanup(
        env
      )
  );

  logger.info(
    env,
    "cron.run.complete",
    {
      durationMs:
        Date.now() -
        started
    }
  );
}


export default {
  fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ) {
    return route(
      request,
      env,
      ctx
    );
  },

  async scheduled(
    _controller:
      ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ) {
    ctx.waitUntil(
      runScheduledPipeline(
        env
      )
    );
  }
};
