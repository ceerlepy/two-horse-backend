import rawConfig
  from "../../config/expert-acquisition.json";


export type ExpertHtmlAcquisitionStage =
  | "cf-scrape"
  | "cf-content"
  | "http";


export type ExpertDiscoveryStage =
  | ExpertHtmlAcquisitionStage
  | "cf-links";


/*
 * Backwards-compatible alias for existing HTML acquisition
 * code. New code should prefer ExpertHtmlAcquisitionStage.
 */
export type ExpertAcquisitionStage =
  ExpertHtmlAcquisitionStage;


export type ExpertPublishingMode =
  | "article"
  | "direct-current-page";


export type ExpertPromptProfile =
  | "generic"
  | "liderform"
  | "istinye"
  | "ganyan-canavari"
  | "coupon-legs";


export interface ExpertPathRule {
  kind:
    | "prefix"
    | "suffix"
    | "contains";

  value:
    string;

  score:
    number;
}


export interface ExpertSourceConfig {
  host:
    string;

  mode:
    ExpertPublishingMode;

  promptProfile:
    ExpertPromptProfile;

  rootIsEditorial:
    boolean;

  preflightRequiresCity:
    boolean;

  allowYearlessDateEvidence:
    boolean;

  excludedCandidateTerms:
    string[];

  entryUrls:
    string[];

  navigationLabels:
    string[];

  contextBoostTerms:
    string[];

  preferredPathRules:
    ExpertPathRule[];
}


export interface ExpertAcquisitionConfig {
  version:
    number;

  discovery: {
    acquisitionOrder:
      ExpertDiscoveryStage[];

    excludedPathPrefixes:
      string[];

    assetExtensions:
      string[];

    negativeTerms:
      string[];

    predictionTerms:
      string[];

    contextContainers:
      string[];

    candidateMinScore:
      number;

    deterministicMinScore:
      number;

    maxCandidates:
      number;

    candidateContextCharacters:
      number;
  };

  extraction: {
    acquisitionOrder:
      ExpertHtmlAcquisitionStage[];

    minimumTextCharacters:
      number;

    sourceHardSafetyCharacters:
      number;

    semanticMaxCharacters:
      number;

    relevanceWindowLines:
      number;

    relevanceTerms:
      string[];
  };

  sources:
    Record<
      string,
      ExpertSourceConfig
    >;
}


const DISCOVERY_STAGES =
  new Set<string>([
    "cf-scrape",
    "cf-links",
    "cf-content",
    "http"
  ]);


const HTML_STAGES =
  new Set<string>([
    "cf-scrape",
    "cf-content",
    "http"
  ]);


function validateStageList(
  values:
    unknown,

  allowed:
    Set<string>,

  name:
    string
): void {
  if (
    !Array.isArray(values) ||
    !values.length ||
    values.some(
      value =>
        !allowed.has(
          String(value)
        )
    )
  ) {
    throw new Error(
      `INVALID_EXPERT_STAGE_CONFIG:${name}`
    );
  }
}


function validateConfig(
  value:
    ExpertAcquisitionConfig
): void {
  if (
    !value ||
    typeof value !== "object" ||
    !value.sources ||
    !value.discovery ||
    !value.extraction
  ) {
    throw new Error(
      "INVALID_EXPERT_ACQUISITION_CONFIG"
    );
  }


  validateStageList(
    value.discovery
      .acquisitionOrder,
    DISCOVERY_STAGES,
    "discovery"
  );


  validateStageList(
    value.extraction
      .acquisitionOrder,
    HTML_STAGES,
    "extraction"
  );


  for (
    const [
      sourceKey,
      source
    ] of
    Object.entries(
      value.sources
    )
  ) {
    if (
      !source.host ||
      !Array.isArray(
        source.entryUrls
      ) ||
      !source.entryUrls.length ||
      !Array.isArray(
        source.navigationLabels
      ) ||
      !Array.isArray(
        source.excludedCandidateTerms
      ) ||
      !Array.isArray(
        source.preferredPathRules
      )
    ) {
      throw new Error(
        `INVALID_EXPERT_SOURCE_CONFIG:${sourceKey}`
      );
    }
  }
}


export const EXPERT_ACQUISITION_CONFIG =
  rawConfig as
    unknown as
    ExpertAcquisitionConfig;


validateConfig(
  EXPERT_ACQUISITION_CONFIG
);


export function expertSourceConfig(
  sourceKey:
    string
): ExpertSourceConfig {
  const source =
    EXPERT_ACQUISITION_CONFIG
      .sources[
        sourceKey
      ];


  if (!source) {
    throw new Error(
      `EXPERT_SOURCE_CONFIG_NOT_FOUND:${sourceKey}`
    );
  }


  return source;
}
