import * as cheerio from "cheerio";


export interface ForeignMeetingLink {
  city: string;
  country: string | null;
  ydOrder: number | null;
  url: string;
}


/*
 * TJK names foreign meetings "<Venue> <Country>" and labels them
 * "(YD n)" on the daily programme page, e.g.
 *   "Longchamp Fransa (YD 3)", "Santa Anita Park ABD (YD 7)".
 * Suffixes are matched longest-first so "Guney Afrika" wins over a
 * bare "Afrika".
 */
const COUNTRY_SUFFIXES: Array<[RegExp, string]> = [
  [/\s(?:Güney|Guney)\s+Afrika$/iu, "Güney Afrika"],
  [/\s(?:İngiltere|Ingiltere|Ingıltere)$/iu, "İngiltere"],
  [/\s(?:Birleşik|Birlesik)\s+(?:Krallık|Krallik)$/iu, "Birleşik Krallık"],
  [/\s(?:İrlanda|Irlanda)$/iu, "İrlanda"],
  [/\s(?:Birleşik\s+Arap\s+Emirlikleri|BAE)$/iu, "BAE"],
  [/\sHong\s+Kong$/iu, "Hong Kong"],
  [/\sABD$/u, "ABD"],
  [/\sFransa$/iu, "Fransa"],
  [/\sAlmanya$/iu, "Almanya"],
  [/\s(?:İtalya|Italya)$/iu, "İtalya"],
  [/\sMalezya$/iu, "Malezya"],
  [/\sAvustralya$/iu, "Avustralya"],
  [/\sJaponya$/iu, "Japonya"],
  [/\sSingapur$/iu, "Singapur"],
  [/\s(?:İsveç|Isvec|İsvec)$/iu, "İsveç"],
  [/\sKanada$/iu, "Kanada"],
  [/\sBrezilya$/iu, "Brezilya"],
  [/\sArjantin$/iu, "Arjantin"],
  [/\sŞili$|\sSili$/iu, "Şili"],
  [/\sKatar$/iu, "Katar"],
  [/\sSuudi\s+Arabistan$/iu, "Suudi Arabistan"]
];


function clean(value: unknown): string {
  return String(value ?? "")
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim();
}


/*
 * Race date from the link's QueryParameter_Tarih (dd/mm/yyyy). Just
 * after midnight TJK's master page still lists the previous day's
 * meetings, so the wall-clock date is not the card's date.
 */
export function raceDateOfForeignLink(url: string): string | null {
  try {
    const value = new URL(url).searchParams.get("QueryParameter_Tarih") ?? "";
    const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
  } catch {
    return null;
  }
}


export function countryOfForeignMeeting(city: string): string | null {
  const name = clean(city);
  for (const [re, country] of COUNTRY_SUFFIXES) {
    if (re.test(name)) return country;
  }
  return null;
}


export function discoverForeignMeetingLinks(
  html: string,
  baseUrl: string
): ForeignMeetingLink[] {
  const $ = cheerio.load(html);
  const result = new Map<string, ForeignMeetingLink>();

  $("a[href]").each((_, element) => {
    const href = clean($(element).attr("href"));
    const label = clean($(element).text());
    const yd = /\(\s*YD\s*(\d+)?\s*\)/iu.exec(label);

    if (!href || !yd || !/\/Info\/Sehir\/GunlukYarisProgrami/i.test(href)) {
      return;
    }

    try {
      const url = new URL(href, baseUrl);
      const city =
        clean(url.searchParams.get("SehirAdi")) ||
        clean(label.replace(/\([^)]*\)/g, ""));

      if (!city) return;

      const key = city.toLocaleLowerCase("tr-TR");
      if (result.has(key)) return;

      result.set(key, {
        city,
        country: countryOfForeignMeeting(city),
        ydOrder: yd[1] ? Number(yd[1]) : null,
        url: url.toString()
      });
    } catch {
      // malformed href
    }
  });

  return [...result.values()].sort(
    (a, b) => (a.ydOrder ?? 99) - (b.ydOrder ?? 99)
  );
}
