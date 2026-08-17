import * as cheerio from "cheerio";
import type { TjkProgramInput } from "../types/models";

type Meeting = TjkProgramInput["meetings"][number];
type Race = Meeting["races"][number];
type Runner = Race["runners"][number];

function clean(v: string): string {
  return v
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function lower(v: string): string {
  return clean(v).toLocaleLowerCase("tr-TR");
}

function numberValue(v: string): number | null {
  const m = clean(v).match(/-?\d+(?:[,.]\d+)?/);
  if (!m) return null;

  const n = Number(m[0].replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function integerValue(v: string): number | null {
  const n = numberValue(v);
  return n == null ? null : Math.trunc(n);
}

function agfValue(v: string): number | null {
  const m = clean(v).match(/%\s*(\d+(?:[,.]\d+)?)/);
  if (!m) return null;

  const n = Number(m[1].replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function firstMeaningfulAnchor(
  $: cheerio.CheerioAPI,
  cell: cheerio.Cheerio<any>
): string | null {
  let result: string | null = null;

  cell.find("a").each((_, el) => {
    if (result) return;

    const text = clean($(el).text());
    if (text) result = text;
  });

  return result;
}

export function discoverDomesticMeetings(
  html: string,
  baseUrl: string
): Array<{ city: string; url: string }> {
  const $ = cheerio.load(html);
  const found = new Map<string, string>();

  $('a[href*="/Info/Sehir/GunlukYarisProgrami"]').each((_, el) => {
    const href = $(el).attr("href");
    const text = clean($(el).text());

    if (!href || !text) return;

    // YD = yabancı yarış. Canonical uygulama programına sokmuyoruz.
    if (/\(\s*YD\b/i.test(text)) return;

    try {
      const url = new URL(href, baseUrl);
      const city =
        clean(url.searchParams.get("SehirAdi") ?? "") ||
        clean(text.replace(/\([^)]*\)/g, ""));

      if (!city) return;

      found.set(city, url.toString());
    } catch {
      // malformed link => ignore
    }
  });

  return [...found.entries()].map(([city, url]) => ({ city, url }));
}

function headerIndexes(
  $: cheerio.CheerioAPI,
  table: cheerio.Cheerio<any>
): Record<string, number> {
  let cells = table.find("thead tr").first().find("th,td");

  if (!cells.length) {
    cells = table.find("tr").first().find("th,td");
  }

  const result: Record<string, number> = {};

  cells.each((i, el) => {
    const h = lower($(el).text());

    if (h === "n" || h === "no" || h === "numara") result.number = i;
    else if (h.includes("at ismi")) result.name = i;
    else if (h.includes("sıklet")) result.weight = i;
    else if (h === "jokey" || h.includes("jokey")) result.jockey = i;
    else if (h === "hp") result.hp = i;
    else if (h === "agf" || h.includes("agf")) result.agf = i;
  });

  return result;
}

function parseRunnerTable(
  $: cheerio.CheerioAPI,
  table: cheerio.Cheerio<any>
): Runner[] {
  const idx = headerIndexes($, table);

  if (
    idx.number == null ||
    idx.name == null ||
    idx.jockey == null
  ) {
    return [];
  }

  const runners: Runner[] = [];

  table.find("tr").each((_, row) => {
    const cells = $(row).find("td");
    if (!cells.length) return;

    const at = (i: number | undefined) =>
      i == null ? null : cells.eq(i);

    const numberCell = at(idx.number);
    const nameCell = at(idx.name);

    if (!numberCell || !nameCell) return;

    const number = integerValue(numberCell.text());

    const name =
      firstMeaningfulAnchor($, nameCell) ??
      clean(nameCell.text())
        .replace(/\([^)]*\)/g, "")
        .trim();

    if (!number || !name) return;

    const jockeyCell = at(idx.jockey);
    const weightCell = at(idx.weight);
    const hpCell = at(idx.hp);
    const agfCell = at(idx.agf);

    const jockey =
      jockeyCell
        ? firstMeaningfulAnchor($, jockeyCell) ??
          (clean(jockeyCell.text()) || null)
        : null;

    runners.push({
      number,
      name,
      jockey,
      weight: weightCell ? numberValue(weightCell.text()) : null,
      hp: hpCell ? integerValue(hpCell.text()) : null,
      agfPercent: agfCell ? agfValue(agfCell.text()) : null
    });
  });

  // duplicate horse numbers rejected deterministically
  const unique = new Map<number, Runner>();

  for (const r of runners) {
    if (!unique.has(r.number)) unique.set(r.number, r);
  }

  return [...unique.values()].sort((a, b) => a.number - b.number);
}

export function parseTjkMeetingPage(
  html: string,
  city: string
): Meeting {
  const $ = cheerio.load(html);

  const races = new Map<number, Race>();
  let currentRace: Race | null = null;

  // h3 + table in true document order.
  $("h3, table").each((_, el) => {
    const node = $(el);

    if (el.tagName?.toLowerCase() === "h3") {
      const text = clean(node.text());

      const raceHeader =
        text.match(/(\d+)\.\s*Koşu\s+(\d{1,2})[.:](\d{2})/i);

      if (raceHeader) {
        const raceNumber = Number(raceHeader[1]);
        const time =
          `${raceHeader[2].padStart(2, "0")}:${raceHeader[3]}`;

        currentRace = {
          raceNumber,
          time,
          distanceMeters: null,
          track: null,
          runners: []
        };

        races.set(raceNumber, currentRace);
        return;
      }

      if (currentRace) {
        const surface =
          text.match(/\b(\d{3,4})\s*(Kum|Çim|Sentetik)\b/i);

        if (surface) {
          currentRace.distanceMeters = Number(surface[1]);

          const s = lower(surface[2]);
          currentRace.track =
            s === "kum"
              ? "Kum"
              : s === "çim"
                ? "Çim"
                : "Sentetik";
        }
      }

      return;
    }

    if (!currentRace) return;

    const headers = lower(
      node.find("tr").first().text()
    );

    if (
      !headers.includes("at ismi") ||
      !headers.includes("jokey")
    ) {
      return;
    }

    const parsed = parseRunnerTable($, node);

    if (parsed.length) {
      currentRace.runners = parsed;
    }
  });

  return {
    city,
    races: [...races.values()]
      .sort((a, b) => a.raceNumber - b.raceNumber)
  };
}

export function assertCompleteProgram(
  program: TjkProgramInput
): void {
  if (!program.meetings?.length) {
    throw new Error("TJK_NO_MEETINGS");
  }

  for (const meeting of program.meetings) {
    if (!meeting.city?.trim()) {
      throw new Error("TJK_CITY_MISSING");
    }

    if (!meeting.races?.length) {
      throw new Error(`TJK_NO_RACES:${meeting.city}`);
    }

    for (const race of meeting.races) {
      if (
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(race.time ?? "")
      ) {
        throw new Error(
          `TJK_TIME_INVALID:${meeting.city}:${race.raceNumber}`
        );
      }

      if (!race.runners?.length) {
        throw new Error(
          `TJK_RUNNERS_EMPTY:${meeting.city}:${race.raceNumber}`
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
            `TJK_RUNNER_INVALID:${meeting.city}:${race.raceNumber}`
          );
        }

        if (numbers.has(runner.number)) {
          throw new Error(
            `TJK_RUNNER_DUPLICATE:${meeting.city}:${race.raceNumber}:${runner.number}`
          );
        }

        numbers.add(runner.number);
      }
    }
  }
}
