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
      (
        async () => {
          /*
           * 1. Refresh all observable pre-race inputs.
           */
          await refreshProgramIfDue(
            env
          ).catch(
            console.error
          );

          await refreshExpertsIfDue(
            env
          ).catch(
            console.error
          );

          await refreshFieldSignalsIfDue(
            env
          ).catch(
            console.error
          );

          /*
           * 2. Persist latest canonical PRE-RACE
           * candidate for every upcoming race.
           */
          await capturePreRaceCandidates(
            env
          ).catch(
            console.error
          );

          /*
           * 3. After start, promote ONLY an already
           * captured pre-race candidate.
           */
          await promoteStartedCandidates(
            env
          ).catch(
            console.error
          );

          await finalizeStartedRaces(
            env
          ).catch(
            console.error
          );

          /*
           * 4. Official results are labels only.
           */
          await ingestOfficialResultsDue(
            env
          ).catch(
            console.error
          );

          await cleanupMarketSnapshots(
            env
          ).catch(
            console.error
          );

          await cleanupLearning(
            env
          ).catch(
            console.error
          );

          await cleanup(
            env
          ).catch(
            console.error
          );
        }
      )()
    );
  }
};
