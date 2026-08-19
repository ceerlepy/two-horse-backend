import * as cheerio
  from "cheerio";

export interface TjkFieldHistoryRow {
  horseName: string;
  raceDate: string | null;
  venue: string | null;
  distanceMeters: number | null;
  track: string | null;
  finishPosition: number | null;
}

export interface TjkFieldPerformancePage {
  tableFound: boolean;
  rows: TjkFieldHistoryRow[];
}

function clean(
  value: unknown
): string {
  return String(
    value ?? ""
  )
    .replace(
      /\u00a0/g,
      " "
    )
    .replace(
      /\s+/g,
      " "
    )
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

function integer(
  value: unknown
): number | null {
  const match =
    clean(value)
      .match(/\d+/);

  if (!match) {
    return null;
  }

  const parsed =
    Number(match[0]);

  return Number.isFinite(
    parsed
  )
    ? Math.trunc(parsed)
    : null;
}

function normalizeDate(
  value: unknown
): string | null {
  const match =
    clean(value)
      .match(
        /(\d{2})[.](\d{2})[.](\d{4})/
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

export function parseTjkFieldPerformancePage(
  html: string
): TjkFieldPerformancePage {
  const $ =
    cheerio.load(html);

  let tableFound =
    false;

  const rows:
    TjkFieldHistoryRow[] = [];

  $("table").each(
    (_, element) => {
      const table =
        $(element);

      const tableRows =
        table.find("tr");

      let indexes:
        Record<string, number> =
        {};

      for (
        let rowIndex = 0;
        rowIndex <
          Math.min(
            4,
            tableRows.length
          );
        rowIndex++
      ) {
        const cells =
          tableRows
            .eq(rowIndex)
            .find(
              "th,td"
            );

        const candidate:
          Record<string, number> =
          {};

        cells.each(
          (index, cell) => {
            const header =
              lower(
                $(cell).text()
              );

            if (
              header === "at"
            ) {
              candidate.horse =
                index;
            } else if (
              header === "tarih"
            ) {
              candidate.date =
                index;
            } else if (
              header.includes(
                "hipodrom"
              )
            ) {
              candidate.venue =
                index;
            } else if (
              header === "mesafe"
            ) {
              candidate.distance =
                index;
            } else if (
              header === "pist"
            ) {
              candidate.track =
                index;
            } else if (
              header === "s"
            ) {
              candidate.finish =
                index;
            }
          }
        );

        if (
          candidate.horse != null &&
          candidate.venue != null &&
          candidate.distance != null &&
          candidate.track != null &&
          candidate.finish != null
        ) {
          indexes =
            candidate;

          tableFound =
            true;

          break;
        }
      }

      if (!tableFound) {
        return;
      }

      tableRows.each(
        (_, row) => {
          const cells =
            $(row)
              .find("td");

          if (!cells.length) {
            return;
          }

          const value =
            (
              index:
                number | undefined
            ) =>
              index == null
                ? ""
                : clean(
                    cells
                      .eq(index)
                      .text()
                  );

          const horseName =
            value(
              indexes.horse
            );

          if (!horseName) {
            return;
          }

          const rawFinish =
            value(
              indexes.finish
            );

          const finishPosition =
            /^derecesiz$/iu.test(
              rawFinish
            )
              ? 0
              : integer(
                  rawFinish
                );

          rows.push({
            horseName,

            raceDate:
              normalizeDate(
                value(
                  indexes.date
                )
              ),

            venue:
              value(
                indexes.venue
              ) || null,

            distanceMeters:
              integer(
                value(
                  indexes.distance
                )
              ),

            track:
              value(
                indexes.track
              ) || null,

            finishPosition
          });
        }
      );
    }
  );

  return {
    tableFound,
    rows
  };
}

export function validateTjkFieldPerformancePage(
  page:
    TjkFieldPerformancePage
): void {
  if (
    !page.tableFound
  ) {
    throw new Error(
      "FIELD_PERFORMANCE_TABLE_NOT_FOUND"
    );
  }
}
