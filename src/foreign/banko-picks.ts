import * as cheerio
  from "cheerio";

/*
 * Banko Tahminler "AI tahmin" post (one per meeting, foreign cards
 * included). Its content is regular, machine-generated markup:
 *
 *   <p><strong>Altılı 1</strong> — Tarih: 04.10.2026 | Altılı Başlangıç: 14:31 | Pist: Longchamp Fransa</p>
 *   <div class="ticket-comments">
 *     <p><strong>1.KOŞU:</strong> 8-GREEN EMPRESS (IRE) ana tercih ... 11-DATA (GB) ve 1-SPIRIT TANGO ...</p>
 *   </div>
 *   <p>Koşu 1: <strong>1-5-8-11</strong></p>      (race number: selected horses)
 *   <p>Toplam Kombinasyon: 960 | Kupon Tutarı: 960.00 ₺</p>
 *
 * "N.KOŞU" and "Koşu N" are the meeting's real race numbers (Altılı 2
 * starts at "Koşu 4"). Horses in a comment are listed in the order the
 * site ranks them, first one being its top pick.
 */

export interface BankoRankedHorse {
  number: number;
  name: string;
}

export interface BankoRacePick {
  raceNumber: number;
  ranked: BankoRankedHorse[];
  selection: number[];
  comment: string;
}

export interface BankoCoupon {
  altili: number;
  startTime: string | null;
  legs: Array<{
    raceNumber: number;
    selection: number[];
  }>;
  combinations: number | null;
  amountTl: number | null;
}

export interface BankoPicks {
  coupons: BankoCoupon[];
  races: BankoRacePick[];
}

function clean(
  value: string
): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/*
 * "8-GREEN EMPRESS (IRE) ana tercih ... 11-DATA (GB) ve 1-SPIRIT TANGO"
 * Names are upper case (Turkish letters, digits, apostrophes, dots,
 * hyphens, an origin suffix in parentheses); the prose around them is
 * lower case, which ends the match.
 */
const RANKED_HORSE =
  /(?:^|[\s,;(])(\d{1,2})-([A-ZÇĞİÖŞÜ0-9][A-ZÇĞİÖŞÜ0-9'’&.\- ]*?[A-ZÇĞİÖŞÜ0-9'’.)]?)(?:\s*\(([A-Z]{2,3})\))?(?=\s+[a-zçğıöşü]|[,;.]\s|[,;.]?$)/g;

export function rankedHorses(
  comment: string
): BankoRankedHorse[] {
  const seen = new Set<number>();
  const output: BankoRankedHorse[] = [];

  for (const match of comment.matchAll(RANKED_HORSE)) {
    const number = Number(match[1]);
    const base = clean(match[2]).replace(/[.\-]+$/, "");
    const name = match[3] ? `${base} (${match[3]})` : base;

    if (!number || !name || seen.has(number)) {
      continue;
    }

    seen.add(number);
    output.push({ number, name });
  }

  return output;
}

function numbers(
  value: string
): number[] {
  return value
    .split(/[^0-9]+/)
    .map(Number)
    .filter(item => Number.isInteger(item) && item > 0);
}

export function parseBankoPicks(
  html: string
): BankoPicks {
  const $ = cheerio.load(html);
  const coupons: BankoCoupon[] = [];
  const comments = new Map<number, string>();
  const selections = new Map<number, number[]>();

  let current: BankoCoupon | null = null;

  $("p").each((_, element) => {
    const text = clean($(element).text());

    const header =
      text.match(/^Altılı\s+(\d+)/i);

    if (header) {
      current = {
        altili: Number(header[1]),
        startTime:
          text.match(/Başlangıç:\s*(\d{1,2}:\d{2})/i)?.[1] ?? null,
        legs: [],
        combinations: null,
        amountTl: null
      };
      coupons.push(current);
      return;
    }

    const comment =
      text.match(/^(\d{1,2})\.\s*KOŞU:\s*(.+)$/i);

    if (comment) {
      const raceNumber = Number(comment[1]);
      if (!comments.has(raceNumber)) {
        comments.set(raceNumber, clean(comment[2]));
      }
      return;
    }

    const leg =
      text.match(/^Koşu\s+(\d{1,2}):\s*([\d\s-]+)$/i);

    if (leg && current) {
      const raceNumber = Number(leg[1]);
      const selection = numbers(leg[2]);
      (current as BankoCoupon).legs.push({ raceNumber, selection });
      if (!selections.has(raceNumber)) {
        selections.set(raceNumber, selection);
      }
      return;
    }

    const total =
      text.match(/Toplam Kombinasyon:\s*(\d+)/i);

    if (total && current) {
      (current as BankoCoupon).combinations = Number(total[1]);
      const amount =
        text.match(/Kupon Tutarı:\s*([\d.,]+)/i)?.[1];
      (current as BankoCoupon).amountTl =
        amount ? Number(amount.replace(/,/g, "")) : null;
    }
  });

  const raceNumbers =
    [...new Set([...comments.keys(), ...selections.keys()])]
      .sort((a, b) => a - b);

  return {
    coupons: coupons.filter(coupon => coupon.legs.length > 0),
    races: raceNumbers.map(raceNumber => {
      const comment = comments.get(raceNumber) ?? "";
      return {
        raceNumber,
        ranked: rankedHorses(comment),
        selection: selections.get(raceNumber) ?? [],
        comment
      };
    })
  };
}
