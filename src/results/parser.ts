import * as cheerio from "cheerio";

import type {
  OfficialMeetingResults,
  OfficialRaceResult,
  OfficialRunnerResult
} from "./types";


function clean(
  value: unknown
): string {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}


function normalizedHeader(
  value: unknown
): string {
  return clean(value)
    .toLocaleLowerCase("tr-TR");
}


function parseHorseIdentity(
  raw: string
): {
  horseName: string;
  horseNumber: number;
} | null {
  /*
   * TJK:
   * SILKY PEARL(11) KG SK ...
   * KERDOS(5) ...
   */
  const match =
    clean(raw).match(
      /^(.+?)\s*\((\d+)\)/
    );

  if (!match) {
    return null;
  }

  const horseName =
    clean(match[1]);

  const horseNumber =
    Number(match[2]);

  if (
    !horseName ||
    !Number.isInteger(horseNumber) ||
    horseNumber <= 0
  ) {
    return null;
  }

  return {
    horseName,
    horseNumber
  };
}


function findHeaderIndex(
  headers: string[],
  predicate:
    (value: string) => boolean
): number {
  return headers.findIndex(
    value =>
      predicate(
        normalizedHeader(value)
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

  let currentRaceNumber:
    number | null = null;

  /*
   * Walk DOM in visible order.
   *
   * A race heading establishes the context for the
   * following result table.
   */
  $("h1,h2,h3,h4,table").each(
    (_, element) => {
      const node =
        $(element);

      if (
        element.tagName !==
        "table"
      ) {
        const heading =
          clean(
            node.text()
          );

        const match =
          heading.match(
            /(\d+)\s*[.]?\s*Koşu\b/iu
          );

        if (match) {
          currentRaceNumber =
            Number(match[1]);
        }

        return;
      }

      if (
        currentRaceNumber == null
      ) {
        return;
      }

      const table =
        node;

      let headers =
        table
          .find("thead th")
          .map(
            (_, cell) =>
              clean(
                $(cell).text()
              )
          )
          .get();

      if (!headers.length) {
        headers =
          table
            .find("tr")
            .first()
            .find("th,td")
            .map(
              (_, cell) =>
                clean(
                  $(cell).text()
                )
            )
            .get();
      }

      /*
       * TJK result table canonical columns:
       *
       * S | At İsmi | ... | Derece | ...
       */
      const finishIndex =
        findHeaderIndex(
          headers,
          value =>
            value === "s"
        );

      const horseIndex =
        findHeaderIndex(
          headers,
          value =>
            value.includes(
              "at ismi"
            ) ||
            value.includes(
              "at adı"
            ) ||
            value.includes(
              "at adi"
            )
        );

      const timeIndex =
        findHeaderIndex(
          headers,
          value =>
            value === "derece"
        );

      if (
        finishIndex < 0 ||
        horseIndex < 0
      ) {
        return;
      }

      const runners:
        OfficialRunnerResult[] = [];

      table
        .find("tbody tr")
        .each(
          (_, row) => {
            const cells =
              $(row)
                .find("td");

            if (!cells.length) {
              return;
            }

            const horseCell =
              clean(
                cells
                  .eq(horseIndex)
                  .text()
              );

            const identity =
              parseHorseIdentity(
                horseCell
              );

            if (!identity) {
              return;
            }

            const rawPosition =
              clean(
                cells
                  .eq(finishIndex)
                  .text()
              );

            const degreeText =
              timeIndex >= 0
                ? clean(
                    cells
                      .eq(timeIndex)
                      .text()
                  )
                : "";

            let finishPosition:
              number | null =
              null;

            if (
              /^\d+$/.test(
                rawPosition
              )
            ) {
              finishPosition =
                Number(
                  rawPosition
                );
            } else if (
              /koşmaz|kosmaz/iu.test(
                degreeText
              ) ||
              /koşmaz|kosmaz/iu.test(
                horseCell
              )
            ) {
              /*
               * Keep official scratches in the result
               * set so frozen pre-race runner identity
               * can still match exactly.
               */
              finishPosition = 0;
            }

            if (
              finishPosition ==
              null
            ) {
              return;
            }

            runners.push({
              horseNumber:
                identity.horseNumber,

              horseName:
                identity.horseName,

              finishPosition
            });
          }
        );

      if (!runners.length) {
        return;
      }

      /*
       * Do not duplicate the same race if TJK renders
       * another summary table later in the document.
       */
      if (
        races.some(
          race =>
            race.raceNumber ===
            currentRaceNumber
        )
      ) {
        return;
      }

      races.push({
        raceNumber:
          currentRaceNumber,

        runners
      });
    }
  );

  return {
    city,
    raceDate,
    races
  };
}
