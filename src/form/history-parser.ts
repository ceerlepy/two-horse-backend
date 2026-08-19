import * as cheerio
  from "cheerio";

import type {
  HorseHistoryRun
} from "./types";

function clean(
  value: unknown
): string {
  return String(
    value ?? ""
  )
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function lower(
  value: unknown
): string {
  return clean(value)
    .toLocaleLowerCase(
      "tr-TR"
    );
}

function numberValue(
  value: unknown
): number | null {
  const match =
    clean(value)
      .match(
        /-?\d+(?:[,.]\d+)?/
      );

  if (!match) {
    return null;
  }

  const parsed =
    Number(
      match[0]
        .replace(",", ".")
    );

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function integerValue(
  value: unknown
): number | null {
  const parsed =
    numberValue(value);

  return parsed === null
    ? null
    : Math.trunc(parsed);
}

function normalizeDate(
  value: string
): string | null {
  const match =
    value.match(
      /(\d{2})\.(\d{2})\.(\d{4})/
    );

  if (!match) {
    return null;
  }

  return (
    `${match[3]}-` +
    `${match[2]}-` +
    `${match[1]}`
  );
}

function headerIndexes(
  $: cheerio.CheerioAPI,
  table: cheerio.Cheerio<any>
): Record<string, number> {
  const result:
    Record<string, number> = {};

  table
    .find("tr")
    .slice(0, 3)
    .each((_, row) => {
      $(row)
        .find("th,td")
        .each(
          (index, element) => {
            const header =
              lower(
                $(element).text()
              );

            if (
              header === "tarih" ||
              header === "date"
            ) {
              result.date = index;
            } else if (
              header === "şehir" ||
              header === "sehir" ||
              header === "rc"
            ) {
              result.city = index;
            } else if (
              header === "msf" ||
              header === "dst"
            ) {
              result.distance = index;
            } else if (
              header === "pist" ||
              header === "track"
            ) {
              result.track = index;
            } else if (
              header === "s"
            ) {
              result.finish = index;
            } else if (
              header.includes(
                "sıklet"
              ) ||
              header === "weight"
            ) {
              result.weight = index;
            } else if (
              header === "jokey" ||
              header === "jockey"
            ) {
              result.jockey = index;
            } else if (
              header === "gny" ||
              header === "win"
            ) {
              result.odds = index;
            } else if (
              header === "hp" ||
              header === "rt"
            ) {
              result.hp = index;
            }
          }
        );
    });

  return result;
}

export function parseHorseHistoryPage(
  html: string
): HorseHistoryRun[] {
  const $ =
    cheerio.load(html);

  let best:
    HorseHistoryRun[] = [];

  $("table").each(
    (_, tableElement) => {
      const table =
        $(tableElement);

      const indexes =
        headerIndexes(
          $,
          table
        );

      if (
        indexes.date === undefined ||
        indexes.finish === undefined
      ) {
        return;
      }

      const rows:
        HorseHistoryRun[] = [];

      table
        .find("tr")
        .each(
          (_, rowElement) => {
            const cells =
              $(rowElement)
                .find("td");

            if (!cells.length) {
              return;
            }

            const textAt = (
              index:
                number | undefined
            ): string => {
              if (
                index === undefined
              ) {
                return "";
              }

              return clean(
                cells.eq(index).text()
              );
            };

            const raceDate =
              normalizeDate(
                textAt(
                  indexes.date
                )
              );

            if (!raceDate) {
              return;
            }

            rows.push({
              raceDate,

              city:
                textAt(
                  indexes.city
                ) || null,

              distanceMeters:
                integerValue(
                  textAt(
                    indexes.distance
                  )
                ),

              track:
                textAt(
                  indexes.track
                ) || null,

              finishPosition:
                integerValue(
                  textAt(
                    indexes.finish
                  )
                ),

              weight:
                numberValue(
                  textAt(
                    indexes.weight
                  )
                ),

              jockey:
                textAt(
                  indexes.jockey
                ) || null,

              odds:
                numberValue(
                  textAt(
                    indexes.odds
                  )
                ),

              hp:
                integerValue(
                  textAt(
                    indexes.hp
                  )
                )
            });
          }
        );

      if (
        rows.length >
        best.length
      ) {
        best = rows;
      }
    }
  );

  return best.sort(
    (a, b) =>
      b.raceDate.localeCompare(
        a.raceDate
      )
  );
}
