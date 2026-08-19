import * as cheerio from "cheerio";
import type { TjkProgramInput } from "../types/models";

export type TjkMeeting = TjkProgramInput["meetings"][number];
export type TjkRace = TjkMeeting["races"][number];
export type TjkRunner = TjkRace["runners"][number];

const DOMESTIC_MEETING_RE =
  /^(.+?)\s*\(\s*\d+\.\s*(?:Y\.?\s*G\.?|Yarış\s+Günü)\s*\)$/iu;

const RACE_HEADER_RE =
  /(\d+)\s*\.\s*Koşu\s+(\d{1,2})[.:](\d{2})/iu;

function clean(value: unknown): string {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function lower(value: unknown): string {
  return clean(value).toLocaleLowerCase("tr-TR");
}

function parseNumber(value: unknown): number | null {
  const match = clean(value).match(/-?\d+(?:[,.]\d+)?/);

  if (!match) {
    return null;
  }

  const number = Number(match[0].replace(",", "."));
  return Number.isFinite(number) ? number : null;
}

function parseInteger(value: unknown): number | null {
  const valueNumber = parseNumber(value);
  return valueNumber == null ? null : Math.trunc(valueNumber);
}

function parseAgf(value: unknown): number | null {
  const text = clean(value);

  const match =
    text.match(/%\s*(\d+(?:[,.]\d+)?)/) ??
    text.match(/(\d+(?:[,.]\d+)?)\s*%/);

  if (!match) {
    return null;
  }

  const number = Number(match[1].replace(",", "."));
  return Number.isFinite(number) ? number : null;
}

function anchorHref(
  $: cheerio.CheerioAPI,
  cell: cheerio.Cheerio<any>
): string | null {
  const anchor =
    cell.find("a[href]").first();

  if (!anchor.length) {
    return null;
  }

  const href =
    clean(
      anchor.attr("href")
    );

  if (!href) {
    return null;
  }

  try {
    return new URL(
      href,
      "https://www.tjk.org"
    ).toString();
  } catch {
    return null;
  }
}

function anchorText(
  $: cheerio.CheerioAPI,
  cell: cheerio.Cheerio<any>
): string | null {
  const anchor = cell.find("a").first();

  if (!anchor.length) {
    return null;
  }

  return clean(anchor.text()) || null;
}

/**
 * Master page discovery does NOT depend on links anymore.
 *
 * TJK visibly prints domestic meetings as:
 *   Ankara (44. Y.G.)
 *   Bursa (28. Yarış Günü)
 *
 * We extract those semantic labels from rendered text.
 */

export interface TjkMeetingLink {
  city: string;
  url: string;
}

/**
 * Prefer TJK's server-provided city-detail href.
 *
 * The master page currently links domestic meetings to:
 * /TR/YarisSever/Info/Sehir/GunlukYarisProgrami
 * and includes server-owned parameters such as SehirId.
 *
 * Keeping that href avoids guessing city IDs or routing semantics.
 */
export function discoverDomesticMeetingLinks(
  html: string,
  baseUrl: string
): TjkMeetingLink[] {
  const $ = cheerio.load(html);
  const result = new Map<string, TjkMeetingLink>();

  $("a[href]").each((_, element) => {
    const href = clean($(element).attr("href"));
    const label = clean($(element).text());

    if (
      !href ||
      !/\/Info\/Sehir\/GunlukYarisProgrami/i.test(href) ||
      /\(\s*YD\b/iu.test(label)
    ) {
      return;
    }

    try {
      const url = new URL(href, baseUrl);

      const queryCity = clean(
        url.searchParams.get("SehirAdi")
      );

      const labelCity = clean(
        label.replace(/\([^)]*\)/g, "")
      );

      const city = queryCity || labelCity;

      if (!city) {
        return;
      }

      const key = city.toLocaleLowerCase("tr-TR");

      if (!result.has(key)) {
        result.set(key, {
          city,
          url: url.toString()
        });
      }
    } catch {
      // malformed href: ignore and allow semantic fallback
    }
  });

  return [...result.values()];
}

export function discoverDomesticMeetingNames(html: string): string[] {
  const $ = cheerio.load(html);
  const result = new Map<string, string>();

  $("li, a, option, span, div").each((_, element) => {
    const text = clean($(element).text());

    if (
      !text ||
      /\(\s*YD\b/iu.test(text)
    ) {
      return;
    }

    const match = text.match(DOMESTIC_MEETING_RE);

    if (!match) {
      return;
    }

    const city = clean(match[1]);

    /*
     * Avoid accidentally capturing giant parent DIV text.
     */
    if (
      !city ||
      city.length > 40 ||
      city.includes("\n")
    ) {
      return;
    }

    const key = city.toLocaleLowerCase("tr-TR");
    result.set(key, city);
  });

  return [...result.values()];
}

function headerIndexes(
  $: cheerio.CheerioAPI,
  table: cheerio.Cheerio<any>
): Record<string, number> {
  const rows = table.find("tr");

  for (let r = 0; r < Math.min(rows.length, 4); r++) {
    const cells = rows.eq(r).find("th,td");
    const indexes: Record<string, number> = {};

    cells.each((index, element) => {
      const header = lower($(element).text());

      if (
        header === "n" ||
        header === "no" ||
        header === "numara"
      ) {
        indexes.number = index;
      } else if (
        header.includes("at ismi") ||
        header === "at"
      ) {
        indexes.name = index;
      } else if (
        header.includes("sıklet") ||
        header.includes("siklet") ||
        header === "kilo"
      ) {
        indexes.weight = index;
      } else if (
        header.includes("jokey")
      ) {
        indexes.jockey = index;
      } else if (
        header === "hp" ||
        header.includes("handikap")
      ) {
        indexes.hp = index;
      } else if (
        header === "agf" ||
        header.includes("agf")
      ) {
        indexes.agf = index;
      } else if (
        header.includes("son 6 y") ||
        header.includes("son 6 yr") ||
        header.includes("son6y")
      ) {
        indexes.recentForm = index;
      }
    });

    if (
      indexes.number != null &&
      indexes.name != null
    ) {
      return indexes;
    }
  }

  return {};
}

function parseRunnerTable(
  $: cheerio.CheerioAPI,
  table: cheerio.Cheerio<any>
): TjkRunner[] {
  const indexes = headerIndexes($, table);

  if (
    indexes.number == null ||
    indexes.name == null
  ) {
    return [];
  }

  const runners: TjkRunner[] = [];

  table.find("tr").each((_, row) => {
    const cells = $(row).find("td");

    if (!cells.length) {
      return;
    }

    const cell = (index: number | undefined) =>
      index == null ? null : cells.eq(index);

    const numberCell = cell(indexes.number);
    const nameCell = cell(indexes.name);

    if (!numberCell || !nameCell) {
      return;
    }

    const number = parseInteger(numberCell.text());

    const name =
      anchorText($, nameCell) ??
      clean(nameCell.text())
        .replace(/\([^)]*\)/g, "")
        .trim();

    if (
      number == null ||
      number <= 0 ||
      !name
    ) {
      return;
    }

    const jockeyCell = cell(indexes.jockey);
    const weightCell = cell(indexes.weight);
    const hpCell = cell(indexes.hp);
    const agfCell = cell(indexes.agf);
    const recentFormCell =
      cell(indexes.recentForm);

    runners.push({
      number,
      name,

      jockey:
        jockeyCell
          ?(
              anchorText($, jockeyCell) ?? (clean(jockeyCell.text()) || null)
            )
          : null,

      weight:
        weightCell
          ? parseNumber(weightCell.text())
          : null,

      hp:
        hpCell
          ? parseInteger(hpCell.text())
          : null,

      agfPercent:
        agfCell
          ? parseAgf(agfCell.text())
          : null,

      recentFormRaw:
        recentFormCell
          ? (
              clean(
                recentFormCell.text()
              ) || null
            )
          : null,

      horseProfileUrl:
        anchorHref(
          $,
          nameCell
        )
    });
  });

  const unique = new Map<number, TjkRunner>();

  for (const runner of runners) {
    if (!unique.has(runner.number)) {
      unique.set(runner.number, runner);
    }
  }

  return [...unique.values()]
    .sort((a, b) => a.number - b.number);
}

function parseRaceHeader(text: string): {
  raceNumber: number;
  time: string;
} | null {
  const match = clean(text).match(RACE_HEADER_RE);

  if (!match) {
    return null;
  }

  return {
    raceNumber: Number(match[1]),
    time:
      `${match[2].padStart(2, "0")}:${match[3]}`
  };
}

function parseSurface(text: string): {
  distanceMeters: number | null;
  track: string | null;
} {
  const match = clean(text).match(
    /\b(\d{3,4})\s*(Kum|Çim|Cim|Sentetik)\b/iu
  );

  if (!match) {
    return {
      distanceMeters: null,
      track: null
    };
  }

  const rawTrack = lower(match[2]);

  return {
    distanceMeters: Number(match[1]),
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

/**
 * Parse a city-selected TJK program page.
 *
 * Important design:
 * - race headers and runner tables are discovered independently
 * - both are paired by document order
 * - this does not depend on table nesting/layout wrappers
 */
export function parseTjkMeetingPage(
  html: string,
  city: string
): TjkMeeting {
  const $ = cheerio.load(html);

  const headers: Array<{
    raceNumber: number;
    time: string;
    distanceMeters: number | null;
    track: string | null;
  }> = [];

  /*
   * Mirror the proven horsai parser as closely as possible.
   *
   * TJK's race program uses h3 elements for both:
   *   1. Koşu 17.45
   * and the following race-title/condition line containing:
   *   1200 Kum
   *   1400 Çim
   *   2000 Sentetik
   *
   * Do not rely on parent/sibling structure.
   * Do not mix h1..h6.
   */
  const h3Texts = $("h3")
    .map((_, element) =>
      clean($(element).text())
    )
    .get();

  const byRace = new Map<
    number,
    {
      raceNumber: number;
      time: string;
      distanceMeters: number | null;
      track: string | null;
    }
  >();

  h3Texts.forEach((text, index) => {
    const header = parseRaceHeader(text);

    if (!header) {
      return;
    }

    /*
     * horsai behaviour:
     * from this race-heading occurrence, take the first later
     * h3 which:
     *   - is non-empty
     *   - is not another race heading
     *   - contains Çim/Kum/Sentetik
     *
     * Important: do not stop merely because navigation contains
     * another race heading. We search later h3 entries exactly
     * like horsai does.
     */
    let surface = {
      distanceMeters: null as number | null,
      track: null as string | null
    };

    for (
      let nextIndex = index + 1;
      nextIndex < h3Texts.length;
      nextIndex++
    ) {
      const candidate = h3Texts[nextIndex];

      if (!candidate) {
        continue;
      }

      if (parseRaceHeader(candidate)) {
        continue;
      }

      const parsed = parseSurface(candidate);

      if (
        parsed.distanceMeters != null &&
        parsed.track != null
      ) {
        surface = parsed;
        break;
      }
    }

    const existing = byRace.get(
      header.raceNumber
    );

    if (!existing) {
      byRace.set(
        header.raceNumber,
        {
          ...header,
          ...surface
        }
      );
      return;
    }

    /*
     * Navigation occurrence may have resolved poorly.
     * Prefer a later duplicate occurrence when it gives us
     * actual surface metadata.
     */
    if (
      surface.distanceMeters != null &&
      surface.track != null
    ) {
      existing.distanceMeters =
        surface.distanceMeters;

      existing.track =
        surface.track;

      existing.time =
        header.time;
    }
  });

  headers.push(
    ...[...byRace.values()].sort(
      (a, b) =>
        a.raceNumber - b.raceNumber
    )
  );

  /*
   * TJK exposes exactly one "Detaylı At Karşılaştırma"
   * link for each race.
   *
   * The href includes:
   * - HIPODROMYERI
   * - KKODU
   * - MESAFE
   * - PISTADI
   *
   * Keep TJK's own URL rather than reconstructing it.
   */
  const performanceUrls =
    $("a[href]")
      .map((_, element) => {
        const href =
          clean(
            $(element).attr("href")
          );

        if (
          !href ||
          !/\/Query\/Page\/AtPerformans/i.test(
            href
          )
        ) {
          return null;
        }

        try {
          return new URL(
            href,
            "https://www.tjk.org"
          ).toString();
        } catch {
          return null;
        }
      })
      .get()
      .filter(
        (value): value is string =>
          Boolean(value)
      );

  const runnerTables: TjkRunner[][] = [];

  $("table").each((_, element) => {
    const table = $(element);
    const text = lower(table.text());

    if (
      !text.includes("at ismi") ||
      !text.includes("jokey")
    ) {
      return;
    }

    const runners = parseRunnerTable($, table);

    if (runners.length) {
      runnerTables.push(runners);
    }
  });

  const count = Math.min(
    headers.length,
    runnerTables.length
  );

  const races: TjkRace[] = [];

  for (let index = 0; index < count; index++) {
    races.push({
      raceNumber:
        headers[index].raceNumber,

      time:
        headers[index].time,

      distanceMeters:
        headers[index].distanceMeters,

      track:
        headers[index].track,

      performanceUrl:
        performanceUrls[index] ??
        null,

      runners:
        runnerTables[index]
    });
  }

  return {
    city,
    races: races.sort(
      (a, b) =>
        a.raceNumber - b.raceNumber
    )
  };
}

export function assertCompleteMeeting(
  meeting: TjkMeeting
): void {
  if (!meeting.city?.trim()) {
    throw new Error("TJK_CITY_MISSING");
  }

  if (!meeting.races?.length) {
    throw new Error(
      `TJK_NO_RACES:${meeting.city}`
    );
  }

  for (const race of meeting.races) {
    if (
      !Number.isInteger(race.raceNumber) ||
      race.raceNumber <= 0
    ) {
      throw new Error(
        `TJK_RACE_NUMBER_INVALID:${meeting.city}`
      );
    }

    if (
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(
        race.time ?? ""
      )
    ) {
      throw new Error(
        `TJK_TIME_INVALID:${meeting.city}:R${race.raceNumber}`
      );
    }

    if (
      !Number.isInteger(race.distanceMeters) ||
      race.distanceMeters == null ||
      race.distanceMeters <= 0
    ) {
      throw new Error(
        `TJK_DISTANCE_MISSING:${meeting.city}:R${race.raceNumber}`
      );
    }

    if (
      race.track !== "Kum" &&
      race.track !== "Çim" &&
      race.track !== "Sentetik"
    ) {
      throw new Error(
        `TJK_TRACK_MISSING:${meeting.city}:R${race.raceNumber}`
      );
    }

    if (!race.runners?.length) {
      throw new Error(
        `TJK_RUNNERS_EMPTY:${meeting.city}:R${race.raceNumber}`
      );
    }

    const numbers = new Set<number>();

    for (const runner of race.runners) {
      if (
        !Number.isInteger(runner.number) ||
        runner.number <= 0 ||
        !runner.name?.trim()
      ) {
        throw new Error(
          `TJK_RUNNER_INVALID:${meeting.city}:R${race.raceNumber}`
        );
      }

      if (numbers.has(runner.number)) {
        throw new Error(
          `TJK_RUNNER_DUPLICATE:${meeting.city}:R${race.raceNumber}:#${runner.number}`
        );
      }

      numbers.add(runner.number);
    }
  }
}

export function assertCompleteProgram(
  program: TjkProgramInput
): void {
  if (!program.meetings?.length) {
    throw new Error("TJK_NO_MEETINGS");
  }

  for (const meeting of program.meetings) {
    assertCompleteMeeting(meeting);
  }
}
