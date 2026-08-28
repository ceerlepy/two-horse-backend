export type AcquisitionStage =
  | "http"
  | "cf-scrape"
  | "cf-content"
  | "browser-session";

export interface AcquiredHtml {
  stage: AcquisitionStage;

  html: string;

  requestedUrl: string;
  finalUrl: string | null;

  status: number | null;
  contentType: string | null;

  bodyLength: number;

  /*
   * Optional adapter/acquisition diagnostics used by
   * admin preview and source-specific ingestion.
   */
  diagnostics?: Record<string, unknown>;
}

export interface AcquisitionFailure {
  stage:
    | AcquisitionStage
    | "cf-json-url"
    | "cf-json-html";

  error: string;
}

export interface AcquisitionDiagnostics {
  failures:
    AcquisitionFailure[];
}

export interface SemanticJsonResult<T> {
  value: T;

  method:
    | "cf-json-url"
    | "cf-json-html"
    | "cf-json-scrape-html"
    | "cf-json-content-html";

  diagnostics:
    AcquisitionDiagnostics;
}
