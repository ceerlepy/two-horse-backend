import type { Env } from "./env";
import { route } from "./api/router";
import { refreshProgramIfDue } from "./tjk/program-service";
import { refreshExpertsIfDue } from "./experts/service";
import { cleanup, finalizeStartedRaces } from "./history/service";
import { cleanupMarketSnapshots } from "./market/repository";

export default {
 fetch(request:Request,env:Env,ctx:ExecutionContext){ return route(request,env,ctx); },
 async scheduled(_controller:ScheduledController,env:Env,ctx:ExecutionContext){
  ctx.waitUntil((async()=>{
   await refreshProgramIfDue(env).catch(console.error);
   await finalizeStartedRaces(env).catch(console.error);
   await refreshExpertsIfDue(env).catch(console.error);
   await cleanup(env).catch(console.error);
   await cleanupMarketSnapshots(env).catch(console.error);
  })());
 }
};
