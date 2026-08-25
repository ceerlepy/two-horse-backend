import rawConfig
  from "../../config/expert-acquisition.json";


export type ExpertAcquisitionStage =
  | "cf-scrape"
  | "cf-content"
  | "http";


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


interface ExpertAcquisitionConfig {
  version:
    number;

  discovery: {
    acquisitionOrder:
      ExpertAcquisitionStage[];

    useLinksFallback:
      boolean;

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
      ExpertAcquisitionStage[];

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


function validateConfig(
  value:
    ExpertAcquisitionConfig
): void {
  if (
    !value ||
    typeof value !==
      "object" ||
    !value.sources ||
    !value.discovery ||
    !value.extraction
  ) {
    throw new Error(
      "INVALID_EXPERT_ACQUISITION_CONFIG"
    );
  }


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
      !source.entryUrls.length
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
    /*
     * Fail closed.
     *
     * Adding a DB source without an acquisition config must
     * never silently fall into generic scraping.
     */
    throw new Error(
      `EXPERT_SOURCE_CONFIG_NOT_FOUND:${sourceKey}`
    );
  }


  return source;
}
