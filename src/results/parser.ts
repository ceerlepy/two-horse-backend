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


function parseRaceNumber(
  value: unknown
): number | null {
  const text =
    clean(value);

  const patterns = [
    /(?:^|\s)(\d+)\s*[.]?\s*Koşu\b/iu,
    /(?:^|\s)Koşu\s*No\s*[:\-]?\s*(\d+)\b/iu,
    /(?:^|\s)(\d+)\s*[.]?\s*Race\b/iu
  ];

  for (const pattern of patterns) {
    const match =
      text.match(pattern);

    if (!match) {
      continue;
    }

    const raceNumber =
      Number(match[1]);

    if (
      Number.isInteger(raceNumber) &&
      raceNumber > 0
    ) {
      return raceNumber;
    }
  }

  return null;
}


function findRaceNumberNearTable(
  $: cheerio.CheerioAPI,
  table: cheerio.Cheerio<any>
): number | null {
  /*
   * TJK markup can change the element used for a race
   * title. Do not depend exclusively on h1-h4.
   *
   * Search the closest visible predecessors before
   * the table, bounded so an earlier race cannot leak
   * into a later unrelated table.
   */
  let current =
    table.prev();

  let inspected = 0;

  while (
    current.length &&
    inspected < 12
  ) {
    const raceNumber =
      parseRaceNumber(
        current.text()
      );

    if (raceNumber != null) {
      return raceNumber;
    }

    /*
     * Inspect one level of descendants because TJK
     * sometimes wraps the text in span/div elements.
     */
    const descendantText =
      current
        .find(
          "h1,h2,h3,h4,h5,h6,div,span,strong,b"
        )
        .map(
          (_, node) =>
            clean(
              $(node).text()
            )
        )
        .get()
        .join(" ");

    const descendantRace =
      parseRaceNumber(
        descendantText
      );

    if (descendantRace != null) {
      return descendantRace;
    }

    current =
      current.prev();

    inspected += 1;
  }

  /*
   * Last conservative fallback: inspect the nearest
   * containing section/card text.
   */
  const container =
    table.closest(
      "section,article,.card,.panel,.race,.kosu,.koşu"
    );

  if (container.length) {
    return parseRaceNumber(
      container
        .first()
        .text()
    );
  }

  return null;
}


function findFinishColumn(
  headers: string[]
): number {
  return findHeaderIndex(
    headers,
    value =>
      value === "s" ||
      value === "sıra" ||
      value === "sira" ||
      value === "sonuç" ||
      value === "sonuc" ||
      value === "derece sırası" ||
      value === "derece sirasi"
  );
}


function findHorseColumn(
  headers: string[]
): number {
  return findHeaderIndex(
    headers,
    value =>
      value.includes("at ismi") ||
      value.includes("at adı") ||
      value.includes("at adi") ||
      value === "at" ||
      value === "at ismi / no" ||
      value === "at adı / no"
  );
}


function findTimeColumn(
  headers: string[]
): number {
  return findHeaderIndex(
    headers,
    value =>
      value === "derece" ||
      value === "zaman"
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
  $("h1,h2,h3,h4,h5,h6,table").each(
    (_, element) => {
      const node =
        $(element);

      if (
        element.tagName !==
        "table"
      ) {
        const parsedRaceNumber =
          parseRaceNumber(
            node.text()
          );

        if (
          parsedRaceNumber != null
        ) {
          currentRaceNumber =
            parsedRaceNumber;
        }

        return;
      }

      const table =
        node;

      /*
       * Prefer explicit heading state, but recover
       * race context from nearby markup when the TJK
       * document no longer uses h1-h6 headings.
       */
      const tableRaceNumber =
        findRaceNumberNearTable(
          $,
          table
        ) ??
        currentRaceNumber;

      if (
        tableRaceNumber == null
      ) {
        return;
      }

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
        findFinishColumn(
          headers
        );

      const horseIndex =
        findHorseColumn(
          headers
        );

      const timeIndex =
        findTimeColumn(
          headers
        );

      if (
        finishIndex < 0 ||
        horseIndex < 0
      ) {
        return;
      }

      const runners:
        OfficialRunnerResult[] = [];

      const bodyRows =
        table
          .find("tbody tr");

      const resultRows =
        bodyRows.length
          ? bodyRows
          : table
              .find("tr")
              .slice(1);

      resultRows
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
            tableRaceNumber
        )
      ) {
        return;
      }

      races.push({
        raceNumber:
          tableRaceNumber,

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
