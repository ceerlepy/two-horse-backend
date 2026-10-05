/*
 * Parses TJK's daily result city page
 * (/TR/YarisSever/Info/Sehir/GunlukYarisSonuclari?SehirId=..) into the
 * fields the value model needs: per race code the distance, surface,
 * breed, going and first prize; per starter the finish, time, final
 * ganyan, AGF, jockey/trainer ids, weight, HP and start (gate) number.
 *
 * TJK renders each runner cell with a stable class name
 * ("gunluk-GunlukYarisSonuclari-<Field>"), so columns are read by class
 * rather than by position.
 */

export interface ArchiveRace {
  raceCode: number;
  raceNumber: number;
  distanceMeters: number | null;
  surface: string | null;
  breed: "Arap" | "Ingiliz" | "other";
  going: string | null;
  classText: string;
  prize1: number | null;
}

export interface ArchiveRunner {
  raceCode: number;
  horseId: number;
  horseNumber: number | null;
  finishPosition: number | null;
  timeSec: number | null;
  ganyan: number | null;
  agfPercent: number | null;
  jockeyId: number | null;
  trainerId: number | null;
  weight: number | null;
  hp: number | null;
  startPosition: number | null;
}

export interface ArchiveMeeting {
  races: ArchiveRace[];
  runners: ArchiveRunner[];
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": "\"", "&#39;": "'", "&nbsp;": " "
};

export function decodeEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, match => ENTITIES[match] ?? match);
}

function text(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

/* "53,5" -> 53.5, "1.234,50" -> 1234.5, "57" -> 57 */
export function trNumber(value: string): number | null {
  const v = value.trim();
  if (!v) return null;
  const normalised = /,\d/.test(v) ? v.replace(/\./g, "").replace(",", ".") : v;
  const n = Number(normalised);
  return Number.isFinite(n) ? n : null;
}

/* "1.31.68" -> 91.68 seconds */
export function raceTimeSeconds(value: string): number | null {
  const m = /^(\d+)\.(\d{2})\.(\d{2})$/.exec(value.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) + Number(m[3]) / 100 : null;
}

function cell(row: string, field: string): string {
  const re = new RegExp(`class="gunluk-GunlukYarisSonuclari-${field}"\\s*>([\\s\\S]*?)</td>`);
  return re.exec(row)?.[1] ?? "";
}

function intParam(html: string, name: string): number | null {
  const m = new RegExp(`${name}=(\\d+)`).exec(html);
  return m ? Number(m[1]) : null;
}

function meetingGoing(html: string): Record<string, string> {
  const going: Record<string, string> = {};
  for (const m of html.matchAll(/raceWeather\w*">\s*([^<]*?)\s*<\/span>/g)) {
    const t = decodeEntities(m[1]);
    for (const part of t.matchAll(/(Kum|Çim|Sentetik)\s*:\s*([^\s,]+(?:\s[^\s,:]+)?)/g)) {
      going[part[1]] = part[2];
    }
  }
  return going;
}

export function parseArchiveMeeting(html: string): ArchiveMeeting {
  const going = meetingGoing(html);
  const races: ArchiveRace[] = [];
  const runners: ArchiveRunner[] = [];

  const parts = html.split(/<div id="(\d{4,7})" sehir="[^"]*">/);
  for (let i = 1; i < parts.length; i += 2) {
    const raceCode = Number(parts[i]);
    const block = parts[i + 1];

    const header = /class="race-details"[\s\S]*?(\d+)\.\s*Koşu\s*([\d.]+)/.exec(block);
    if (!header) continue;

    const config = /<h3 class="race-config">([\s\S]*?)<\/h3>/.exec(block);
    const configText = config ? text(config[1]) : "";
    const classMatch = /<h3 class="race-config">\s*(<a[^>]*>[\s\S]*?<\/a>|[^,<]*)/.exec(block);
    const distance = /(\d{3,4})\s+(Kum|Çim|Sentetik)/.exec(configText);
    const prize = /Ikramiye:\s*<\/h3>\s*<dl>\s*<dt>1\.\)<\/dt>\s*<dd>\s*([\d.]+)/.exec(block);
    const surface = distance ? distance[2] : null;

    races.push({
      raceCode,
      raceNumber: Number(header[1]),
      distanceMeters: distance ? Number(distance[1]) : null,
      surface,
      breed: configText.includes("Arap") ? "Arap" : configText.includes("İngiliz") ? "Ingiliz" : "other",
      going: surface ? going[surface] ?? null : null,
      classText: classMatch ? text(classMatch[1]) : "",
      prize1: prize ? Number(prize[1].replace(/\./g, "")) : null
    });

    const table = /<table summary="Kosular"[\s\S]*?<\/table>/.exec(block);
    if (!table) continue;

    for (const rowMatch of table[0].matchAll(/<tr class="(?:odd|even)[^"]*">([\s\S]*?)<\/tr>/g)) {
      const row = rowMatch[1];
      const nameCell = cell(row, "AtAdi3");
      const horseId = intParam(nameCell, "AtId");
      if (horseId == null) continue;

      const timeText = text(cell(row, "Derece"));
      if (/koşmaz/i.test(timeText)) continue;

      const number = />\s*[^<]*?\((\d+)\)/.exec(nameCell);
      const finish = text(cell(row, "SONUCNO"));
      const agf = /title="%([\d,]+)\(\d+\)"/.exec(cell(row, "AGFORAN"));
      const weight = /^([\d,]+)/.exec(text(cell(row, "Kilo")));
      const hp = text(cell(row, "Hc"));
      const start = text(cell(row, "StartId"));

      runners.push({
        raceCode,
        horseId,
        horseNumber: number ? Number(number[1]) : null,
        finishPosition: /^\d+$/.test(finish) ? Number(finish) : null,
        timeSec: raceTimeSeconds(timeText),
        ganyan: trNumber(text(cell(row, "Gny"))),
        agfPercent: agf ? trNumber(agf[1]) : null,
        jockeyId: intParam(cell(row, "JokeAdi"), "JokeyId"),
        trainerId: intParam(cell(row, "AntronorAdi"), "AntrenorId"),
        weight: weight ? trNumber(weight[1]) : null,
        hp: /^\d+$/.test(hp) ? Number(hp) : null,
        startPosition: /^\d+$/.test(start) ? Number(start) : null
      });
    }
  }

  return { races, runners };
}

/* City result links on the date index page; only domestic SehirId 1-10. */
export function parseArchiveIndex(html: string): Array<{ cityId: number; url: string }> {
  const out = new Map<number, string>();
  for (const m of html.matchAll(/Sehir\/GunlukYarisSonuclari\?[^"]*/g)) {
    const href = decodeEntities(m[0]);
    const id = intParam(href, "SehirId");
    if (id != null && id >= 1 && id <= 10 && !out.has(id)) {
      out.set(id, `https://www.tjk.org/TR/YarisSever/Info/${href}`);
    }
  }
  return [...out.entries()].map(([cityId, url]) => ({ cityId, url }));
}
