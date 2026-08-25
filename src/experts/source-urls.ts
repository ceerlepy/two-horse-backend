import type {
  ExpertSource
} from "./source-types";

import {
  expertSourceConfig
} from "../config/expert-acquisition";


function normalizeUrl(
  value:
    string |
    null |
    undefined
): string | null {
  if (!value) {
    return null;
  }


  try {
    const url =
      new URL(value);


    if (
      url.protocol !==
        "https:" &&
      url.protocol !==
        "http:"
    ) {
      return null;
    }


    url.hash = "";


    return url.toString();

  } catch {
    return null;
  }
}


function dedupe(
  values:
    Array<
      string |
      null |
      undefined
    >
): string[] {
  const seen =
    new Set<string>();


  const output:
    string[] = [];


  for (const value of values) {
    const url =
      normalizeUrl(
        value
      );


    if (
      !url ||
      seen.has(url)
    ) {
      continue;
    }


    seen.add(url);
    output.push(url);
  }


  return output;
}


export function expertConfiguredEntryUrls(
  source:
    ExpertSource
): string[] {
  return dedupe(
    expertSourceConfig(
      source.source_key
    )
      .entryUrls
  );
}


export function expertRootUrl(
  source:
    ExpertSource
): string | null {
  return normalizeUrl(
    source.homepage_url
  );
}


export function expertLandingUrls(
  source:
    ExpertSource
): string[] {
  return dedupe([
    ...expertConfiguredEntryUrls(
      source
    ),

    expertRootUrl(
      source
    )
  ]);
}


export function expertUrlCandidates(
  source:
    ExpertSource
): string[] {
  return dedupe([
    source.last_working_url,

    ...expertLandingUrls(
      source
    )
  ]);
}
