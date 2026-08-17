import * as cheerio from "cheerio";
import type { TjkProgramInput } from "../types/models";

type Meeting =
  TjkProgramInput["meetings"][number];

type Race =
  Meeting["races"][number];

type Runner =
  Race["runners"][number];

function clean(value: unknown): string {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function lower(value: unknown): string {
  return clean(value)
    .toLocaleLowerCase("tr-TR");
}

function numberValue(
  value: unknown
): number | null {
  const match = clean(value)
    .match(/-?\d+(?:[,.]\d+)?/);

  if (!match) {
    return null;
  }

  const parsed = Number(
    match[0].replace(",", ".")
  );

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function integerValue(
  value: unknown
): number | null {
  const parsed = numberValue(value);

  return parsed == null
    ? null
    : Math.trunc(parsed);
}

function agfValue(
  value: unknown
): number | null {
  const text = clean(value);

  const match =
    text.match(/%\s*(\d+(?:[,.]\d+)?)/) ??
    text.match(/(\d+(?:[,.]\d+)?)\s*%/);

  if (!match) {
    return null;
  }

  const parsed = Number(
    match[1].replace(",", ".")
  );

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function anchorText(
  $: cheerio.CheerioAPI,
  cell: cheerio.Cheerio<any>
): string | null {
  let result: string | null = null;

  cell.find("a").each((_, element) => {
    if (result) {
      return;
    }

    const text = clean(
      $(element).text()
    );

    if (text) {
      result = text;
    }
  });

  return result;
}

export function discoverDomesticMeetings(
  html: string,
  baseUrl: string
): Array<{
  city: string;
  url: string;
}> {
  const $ = cheerio.load(html);

  const meetings =
    new Map<string, string>();

  /*
   * Bilerek CSS href substring selector kullanmıyoruz.
   * URL path casing'i değişse bile regex case-insensitive.
   */
  $("a[href]").each((_, element) => {
    const href = clean(
      $(element).attr("href")
    );

    const label = clean(
      $(element).text()
    );

    if (
      !href ||
      !/\/Info\/Sehir\/GunlukYarisProgrami/i.test(
        href
      )
    ) {
      return;
    }

    /*
     * YD = yabancı program.
     * Two Horse canonical domestic meeting listesine girmez.
     */
    if (/\(\s*YD\b/i.test(label)) {
      return;
    }

    try {
      const url = new URL(
        href,
        baseUrl
      );

      const queryCity = clean(
        url.searchParams.get(
          "SehirAdi"
        )
      );

      const labelCity = clean(
        label.replace(
          /\([^)]*\)/g,
          ""
        )
      );

      const city =
        queryCity || labelCity;

      if (!city) {
        return;
      }

      meetings.set(
        city,
        url.toString()
      );
    } catch {
      // malformed URL => ignore
    }
  });

  return [...meetings.entries()]
    .map(([city, url]) => ({
      city,
      url
    }));
}

function headerIndexes(
  $: cheerio.CheerioAPI,
  table: cheerio.Cheerio<any>
): Record<string, number> {
  let headerCells =
    table
      .find("thead tr")
      .first()
      .find("th,td");

  if (!headerCells.length) {
    headerCells =
      table
        .find("tr")
        .first()
        .find("th,td");
  }

  const indexes:
    Record<string, number> = {};

  headerCells.each((index, element) => {
    const header = lower(
      $(element).text()
    );

    if (
      header === "n" ||
      header === "no" ||
      header === "numara"
    ) {
      indexes.number = index;
    } else if (
      header.includes("at ismi")
    ) {
      indexes.name = index;
    } else if (
      header.includes("sıklet") ||
      header.includes("siklet")
    ) {
      indexes.weight = index;
    } else if (
      header.includes("jokey")
    ) {
      indexes.jockey = index;
    } else if (
      header === "hp"
    ) {
      indexes.hp = index;
    } else if (
      header === "agf" ||
      header.includes("agf")
    ) {
      indexes.agf = index;
    }
  });

  return indexes;
}

function parseRunnerTable(
  $: cheerio.CheerioAPI,
  table: cheerio.Cheerio<any>
): Runner[] {
  const indexes =
    headerIndexes($, table);

  if (
    indexes.number == null ||
    indexes.name == null
  ) {
    return [];
  }

  const runners: Runner[] = [];

  table.find("tr").each((_, row) => {
    const cells =
      $(row).find("td");

    if (!cells.length) {
      return;
    }

    const cell = (
      index: number | undefined
    ) =>
      index == null
        ? null
        : cells.eq(index);

    const numberCell =
      cell(indexes.number);

    const nameCell =
      cell(indexes.name);

    if (
      !numberCell ||
      !nameCell
    ) {
      return;
    }

    const number =
      integerValue(
        numberCell.text()
      );

    const name =
      anchorText($, nameCell) ??
      clean(nameCell.text())
        .replace(/\([^)]*\)/g, "")
        .trim();

    if (
      !number ||
      !name
    ) {
      return;
    }

    const jockeyCell =
      cell(indexes.jockey);

    const weightCell =
      cell(indexes.weight);

    const hpCell =
      cell(indexes.hp);

    const agfCell =
      cell(indexes.agf);

    const jockeyText =
      jockeyCell
        ? (
            anchorText(
              $,
              jockeyCell
            ) ??
            clean(
              jockeyCell.text()
            )
          )
        : "";

    runners.push({
      number,
      name,

      jockey:
        jockeyText || null,

      weight:
        weightCell
          ? numberValue(
              weightCell.text()
            )
          : null,

      hp:
        hpCell
          ? integerValue(
              hpCell.text()
            )
          : null,

      agfPercent:
        agfCell
          ? agfValue(
              agfCell.text()
            )
          : null
    });
  });

  /*
   * Duplicate horse number varsa
   * ilk geçerli kayıt tutulur.
   */
  const unique =
    new Map<number, Runner>();

  for (const runner of runners) {
    if (
      !unique.has(
        runner.number
      )
    ) {
      unique.set(
        runner.number,
        runner
      );
    }
  }

  return [...unique.values()]
    .sort(
      (a, b) =>
        a.number - b.number
    );
}

function raceHeader(
  value: string
): {
  raceNumber: number;
  time: string;
} | null {
  const text = clean(value);

  /*
   * TJK örnekleri:
   * 1. Koşu 14.00
   * 1. Koşu 14:00
   * 1.Koşu 14.00
   */
  const match = text.match(
    /(\d+)\s*\.\s*Koşu\s+(\d{1,2})[.:](\d{2})/i
  );

  if (!match) {
    return null;
  }

  return {
    raceNumber:
      Number(match[1]),

    time:
      `${match[2].padStart(
        2,
        "0"
      )}:${match[3]}`
  };
}

function surfaceData(
  value: string
): {
  distanceMeters: number | null;
  track: string | null;
} {
  const text = clean(value);

  const match = text.match(
    /\b(\d{3,4})\s*(Kum|Çim|Cim|Sentetik)\b/i
  );

  if (!match) {
    return {
      distanceMeters: null,
      track: null
    };
  }

  const rawTrack =
    lower(match[2]);

  return {
    distanceMeters:
      Number(match[1]),

    track:
      rawTrack === "kum"
        ? "Kum"
        : (
            rawTrack === "çim" ||
            rawTrack === "cim"
          )
          ? "Çim"
          : "Sentetik"
  };
}

export function parseTjkMeetingPage(
  html: string,
  city: string
): Meeting {
  const $ = cheerio.load(html);

  const races =
    new Map<number, Race>();

  let currentRace:
    Race | null = null;

  /*
   * DOM order önemli.
   *
   * TJK:
   * h3 => race header
   * h3 => race conditions
   * ...
   * table => runners
   */
  $("h1,h2,h3,h4,table")
    .each((_, element) => {
      const node = $(element);

      const tag =
        element.tagName
          ?.toLowerCase();

      if (tag !== "table") {
        const text =
          clean(node.text());

        const header =
          raceHeader(text);

        if (header) {
          const existing =
            races.get(
              header.raceNumber
            );

          if (existing) {
            /*
             * Üst navigasyonda aynı koşu
             * bir kez daha görünebilir.
             */
            currentRace = existing;

            if (
              !existing.time
            ) {
              existing.time =
                header.time;
            }
          } else {
            currentRace = {
              raceNumber:
                header.raceNumber,

              time:
                header.time,

              distanceMeters:
                null,

              track:
                null,

              runners:
                []
            };

            races.set(
              header.raceNumber,
              currentRace
            );
          }

          return;
        }

        if (currentRace) {
          const surface =
            surfaceData(text);

          if (
            surface.distanceMeters
          ) {
            currentRace
              .distanceMeters =
                surface
                  .distanceMeters;
          }

          if (surface.track) {
            currentRace.track =
              surface.track;
          }
        }

        return;
      }

      if (!currentRace) {
        return;
      }

      const tableText =
        lower(node.text());

      /*
       * Runner tablosunu diğer
       * ikramiye / bahis tablolarından ayır.
       */
      if (
        !tableText.includes(
          "at ismi"
        ) ||
        !tableText.includes(
          "jokey"
        )
      ) {
        return;
      }

      const parsed =
        parseRunnerTable(
          $,
          node
        );

      if (parsed.length) {
        currentRace.runners =
          parsed;
      }
    });

  return {
    city,
    races:
      [...races.values()]
        .sort(
          (a, b) =>
            a.raceNumber -
            b.raceNumber
        )
  };
}

export function assertCompleteMeeting(
  meeting: Meeting
): void {
  if (!meeting.city?.trim()) {
    throw new Error(
      "TJK_CITY_MISSING"
    );
  }

  if (!meeting.races?.length) {
    throw new Error(
      `TJK_NO_RACES:${meeting.city}`
    );
  }

  for (
    const race of meeting.races
  ) {
    if (
      !Number.isInteger(
        race.raceNumber
      ) ||
      race.raceNumber <= 0
    ) {
      throw new Error(
        `TJK_RACE_NUMBER_INVALID:${meeting.city}`
      );
    }

    if (
      !/^([01]\d|2[0-3]):[0-5]\d$/
        .test(
          race.time ?? ""
        )
    ) {
      throw new Error(
        `TJK_TIME_INVALID:${meeting.city}:R${race.raceNumber}`
      );
    }

    if (
      !race.runners?.length
    ) {
      throw new Error(
        `TJK_RUNNERS_EMPTY:${meeting.city}:R${race.raceNumber}`
      );
    }

    const horseNumbers =
      new Set<number>();

    for (
      const runner of
        race.runners
    ) {
      if (
        !Number.isInteger(
          runner.number
        ) ||
        runner.number <= 0 ||
        !runner.name?.trim()
      ) {
        throw new Error(
          `TJK_RUNNER_INVALID:${meeting.city}:R${race.raceNumber}`
        );
      }

      if (
        horseNumbers.has(
          runner.number
        )
      ) {
        throw new Error(
          `TJK_RUNNER_DUPLICATE:${meeting.city}:R${race.raceNumber}:#${runner.number}`
        );
      }

      horseNumbers.add(
        runner.number
      );
    }
  }
}

export function assertCompleteProgram(
  program: TjkProgramInput
): void {
  if (
    !program.meetings?.length
  ) {
    throw new Error(
      "TJK_NO_MEETINGS"
    );
  }

  for (
    const meeting of
      program.meetings
  ) {
    assertCompleteMeeting(
      meeting
    );
  }
}
