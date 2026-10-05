/* TJK's domestic hippodromes: SehirId on tjk.org, key on vhs.tjk.org muhtemeller. */
export const DOMESTIC_CITIES: Array<{ id: number; name: string; key: string }> = [
  { id: 1, name: "Adana", key: "ADANA" },
  { id: 2, name: "İzmir", key: "IZMIR" },
  { id: 3, name: "İstanbul", key: "ISTANBUL" },
  { id: 4, name: "Bursa", key: "BURSA" },
  { id: 5, name: "Ankara", key: "ANKARA" },
  { id: 6, name: "Şanlıurfa", key: "SANLIURFA" },
  { id: 7, name: "Elazığ", key: "ELAZIG" },
  { id: 8, name: "Diyarbakır", key: "DIYARBAKIR" },
  { id: 9, name: "Kocaeli", key: "KOCAELI" },
  { id: 10, name: "Antalya", key: "ANTALYA" }
];

const BY_NAME = new Map(DOMESTIC_CITIES.map(c => [c.name.toLocaleLowerCase("tr-TR"), c]));

export function domesticCity(name: string | null | undefined) {
  return name ? BY_NAME.get(name.trim().toLocaleLowerCase("tr-TR")) ?? null : null;
}

/* "tjk-horse:107969" -> 107969 */
export function tjkNumericId(identity: string | null | undefined): number | null {
  const m = /^tjk-(?:horse|jockey):(\d+)$/.exec(identity ?? "");
  return m ? Number(m[1]) : null;
}

export function addDays(isoDate: string, delta: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/* "2026-09-20" -> "20%2F09%2F2026" */
export function tjkQueryDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return encodeURIComponent(`${d}/${m}/${y}`);
}
