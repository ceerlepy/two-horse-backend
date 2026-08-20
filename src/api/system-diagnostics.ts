import type {
  Env
} from "../env";

import {
  routeDiagnostics
} from "./diagnostics/routes";

export async function systemDiagnosticResponse(
  request: Request,
  env: Env
): Promise<Response | null> {
  return routeDiagnostics(
    request,
    env
  );
}
