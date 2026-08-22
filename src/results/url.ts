const RESULT_PAGE_URL =
  "https://www.tjk.org/TR/YarisSever/Info/Page/GunlukYarisSonuclari";

const RESULT_CITY_URL =
  "https://www.tjk.org/TR/YarisSever/Info/Sehir/GunlukYarisSonuclari";


function resultDate(
  raceDate: string
): string {
  const match =
    raceDate.match(
      /^(\d{4})-(\d{2})-(\d{2})$/
    );

  if (!match) {
    throw new Error(
      `INVALID_RESULT_DATE:${raceDate}`
    );
  }

  return (
    `${match[3]}/${match[2]}/${match[1]}`
  );
}


export function buildOfficialResultsPageUrl(
  raceDate: string,
  city: string
): string {
  const url =
    new URL(
      RESULT_PAGE_URL
    );

  url.searchParams.set(
    "QueryParameter_Tarih",
    resultDate(raceDate)
  );

  url.searchParams.set(
    "SehirAdi",
    city
  );

  return url.toString();
}


export function buildOfficialResultsCityUrl(
  raceDate: string,
  city: string,
  cityId: string
): string {
  const url =
    new URL(
      RESULT_CITY_URL
    );

  url.searchParams.set(
    "QueryParameter_Tarih",
    resultDate(raceDate)
  );

  url.searchParams.set(
    "SehirAdi",
    city
  );

  url.searchParams.set(
    "SehirId",
    cityId
  );

  return url.toString();
}


/*
 * Backward-compatible alias.
 *
 * Acquisition first uses this page only for city-link
 * discovery. The actual race result HTML must come from
 * buildOfficialResultsCityUrl().
 */
export function buildOfficialResultsUrl(
  raceDate: string,
  city: string
): string {
  return buildOfficialResultsPageUrl(
    raceDate,
    city
  );
}
