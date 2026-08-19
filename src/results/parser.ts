import * as cheerio from "cheerio";

import type {
  OfficialMeetingResults,
  OfficialRaceResult,
  OfficialRunnerResult
} from "./types";


function clean(
  value: string | null | undefined
): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}


function integer(
  value: string
): number | null {
  const match =
    clean(value).match(/\d+/);

  if (!match) {
    return null;
  }

  const parsed =
    Number(match[0]);

  return Number.isInteger(parsed)
    ? parsed
    : null;
}


function normalized(
  value: string
): string {
  return clean(value)
    .toLocaleUpperCase("tr-TR")
    .replace(/[İI]/g, "I")
    .replace(/Ş/g, "S")
    .replace(/Ğ/g, "G")
    .replace(/Ü/g, "U")
    .replace(/Ö/g, "O")
    .replace(/Ç/g, "C");
}


function headerIndex(
  headers: string[],
  candidates: string[]
): number {
  const wanted =
    candidates.map(normalized);

  return headers.findIndex(
    header =>
      wanted.some(
        candidate =>
          normalized(header)
            .includes(candidate)
      )
  );
}


export function parseOfficialResultsHtml(
  html: string,
  city: string,
  raceDate: string
): OfficialMeetingResults {
  const $ =
    cheerio.load(html);

  const races:
    OfficialRaceResult[] = [];

  /*
   * TJK layouts can change wrappers/classes.
   * We therefore identify result tables semantically
   * from their visible headers instead of relying on
   * one fragile CSS class.
   */
  $("table").each((_, table) => {
    const headers =
      $(table)
        .find("thead th")
        .map(
          (_i, element) =>
            clean($(element).text())
        )
        .get();

    if (headers.length === 0) {
      const firstRow =
        $(table)
          .find("tr")
          .first();

      firstRow
        .find("th,td")
        .each((_i, element) => {
          headers.push(
            clean($(element).text())
          );
        });
    }

    const numberIndex =
      headerIndex(
        headers,
        [
          "AT NO",
          "AT NO.",
          "NO"
        ]
      );

    const horseIndex =
      headerIndex(
        headers,
        [
          "AT ADI",
          "AT ISMI",
          "AT"
        ]
      );

    const finishIndex =
      headerIndex(
        headers,
        [
          "DERECE",
          "SIRA",
          "BITIRIS"
        ]
      );

    if (
      numberIndex < 0 ||
      horseIndex < 0 ||
      finishIndex < 0
    ) {
      return;
    }

    /*
     * Find race number from the nearest surrounding
     * visible context.
     */
    const context =
      clean(
        $(table)
          .parent()
          .text()
          .slice(0, 1500)
      );

    const raceMatch =
      context.match(
        /(\d+)\s*\.?\s*KOŞU/i
      );

    if (!raceMatch) {
      return;
    }

    const raceNumber =
      Number(raceMatch[1]);

    const runners:
      OfficialRunnerResult[] = [];

    $(table)
      .find("tbody tr")
      .each((_rowIndex, row) => {
        const cells =
          $(row)
            .find("td")
            .map(
              (_i, element) =>
                clean($(element).text())
            )
            .get();

        if (
          cells.length <=
          Math.max(
            numberIndex,
            horseIndex,
            finishIndex
          )
        ) {
          return;
        }

        const horseNumber =
          integer(
            cells[numberIndex]
          );

        const horseName =
          clean(
            cells[horseIndex]
          );

        const finishPosition =
          integer(
            cells[finishIndex]
          );

        if (
          horseNumber == null ||
          !horseName ||
          finishPosition == null
        ) {
          return;
        }

        runners.push({
          horseNumber,
          horseName,
          finishPosition
        });
      });

    if (runners.length > 0) {
      races.push({
        raceNumber,
        runners
      });
    }
  });

  return {
    city,
    raceDate,
    races
  };
}
