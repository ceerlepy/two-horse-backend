import * as cheerio from "cheerio";


/*
 * Parses TJK's per-race "İdman Bilgileri" fragment
 * (Karsilastirma?KosuKodu=..&KTip=5, table#KosuIdmanGaloplari_table).
 * One row per runner: the latest recorded gallop, with split times in
 * columns headed "2200m" … "200m". Columns are located by header text
 * rather than position so a reordered or extra column does not shift
 * every value.
 */

export interface TrainingSplit {
  distanceMeters: number;
  time: string;
}

export interface RunnerTraining {
  horseNumber: number;
  horseName: string;
  trainingDate: string | null;
  track: string | null;
  trackCondition: string | null;
  trainingType: string | null;
  hippodrome: string | null;
  jockey: string | null;
  splits: TrainingSplit[];
  detailUrl: string | null;
  videoUrl: string | null;
}

export const TJK_TRAINING_BASE = "https://www.tjk.org";


export function trainingUrlForRace(raceCode: string): string {
  return (
    `${TJK_TRAINING_BASE}/TR/YarisSever/Info/Karsilastirma/Karsilastirma` +
    `?KosuKodu=${encodeURIComponent(raceCode)}&Era=today&KTip=5`
  );
}


/*
 * races.performance_url is TJK's own AtPerformans link and carries the
 * race code as QueryParameter_KKODU; the training fragment is keyed by
 * the same code (KosuKodu).
 */
export function raceCodeFromPerformanceUrl(
  performanceUrl: string | null | undefined
): string | null {
  if (!performanceUrl) return null;
  const match = /[?&]QueryParameter_KKODU=(\d+)/i.exec(performanceUrl);
  return match ? match[1] : null;
}


function clean(value: unknown): string {
  return String(value ?? "")
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim();
}


function nullable(value: string): string | null {
  return value ? value : null;
}


function header(value: string): string {
  return clean(value).toLocaleLowerCase("tr-TR");
}


const SPLIT_TIME_RE = /^\d{1,2}\.\d{2}\.\d{2}$/;
const DATE_RE = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;


/* "2.10.2026" -> "2026-10-02" */
export function isoTrainingDate(value: string): string | null {
  const match = DATE_RE.exec(clean(value));
  if (!match) return null;
  const [, d, m, y] = match;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}


function absolute(href: string | undefined, base: string): string | null {
  if (!href) return null;
  try {
    const url = new URL(href, base);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || !(host === "tjk.org" || host.endsWith(".tjk.org"))) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}


export function parseRaceTraining(
  html: string,
  pageUrl: string = TJK_TRAINING_BASE + "/TR/YarisSever/Info/Karsilastirma/Karsilastirma"
): RunnerTraining[] {
  const $ = cheerio.load(html);
  const table =
    $("#KosuIdmanGaloplari_table").length
      ? $("#KosuIdmanGaloplari_table").first()
      : $("table").filter((_, t) => /idman/i.test($(t).find("thead").text())).first();

  if (!table.length) return [];

  const headers = table.find("thead th").map((_, th) => header($(th).text())).get();

  const find = (pred: (h: string) => boolean): number =>
    headers.findIndex(pred);

  const col = {
    number: find(h => h === "at no"),
    name: find(h => h === "at adı"),
    date: find(h => h.includes("idman") && h.includes("tarihi")),
    track: find(h => h === "pist"),
    condition: find(h => h.includes("pist") && h.includes("durumu")),
    type: find(h => h.includes("idman") && h.includes("türü")),
    hippodrome: find(h => h.includes("idman") && h.includes("hipodromu")),
    jockey: find(h => h.includes("idman") && h.includes("jokeyi")),
    detail: find(h => h === "detay"),
    video: find(h => h === "video")
  };

  const splitColumns = headers
    .map((h, index) => {
      const match = /^(\d{3,4})m$/.exec(h.replace(/\s+/g, ""));
      return match ? { index, distanceMeters: Number(match[1]) } : null;
    })
    .filter((v): v is { index: number; distanceMeters: number } => v !== null);

  if (col.number < 0 || col.name < 0) return [];

  const output: RunnerTraining[] = [];

  table.find("tbody tr").each((_, row) => {
    const cells = $(row).children("td");
    const cell = (index: number) => (index >= 0 ? cells.eq(index) : null);
    const text = (index: number) => clean(cell(index)?.text() ?? "");

    const horseNumber = Number(text(col.number));
    const horseName = text(col.name);
    if (!Number.isInteger(horseNumber) || horseNumber <= 0 || !horseName) return;

    const splits = splitColumns
      .map(({ index, distanceMeters }) => ({ distanceMeters, time: text(index) }))
      .filter(split => SPLIT_TIME_RE.test(split.time))
      .sort((a, b) => b.distanceMeters - a.distanceMeters);

    output.push({
      horseNumber,
      horseName,
      trainingDate: isoTrainingDate(text(col.date)),
      track: nullable(text(col.track)),
      trackCondition: nullable(text(col.condition)),
      trainingType: nullable(text(col.type)),
      hippodrome: nullable(text(col.hippodrome)),
      jockey: nullable(text(col.jockey)),
      splits,
      detailUrl: absolute(cell(col.detail)?.find("a").attr("href"), pageUrl),
      videoUrl: absolute(cell(col.video)?.find("a").attr("href"), pageUrl)
    });
  });

  const seen = new Set<number>();
  return output.filter(r => (seen.has(r.horseNumber) ? false : (seen.add(r.horseNumber), true)));
}
