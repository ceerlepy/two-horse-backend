export function buildOfficialResultsUrl(
  raceDate: string,
  city: string
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

  const date =
    `${match[3]}/${match[2]}/${match[1]}`;

  const url =
    new URL(
      "https://www.tjk.org/TR/YarisSever/Info/Page/GunlukYarisSonuclari"
    );

  url.searchParams.set(
    "QueryParameter_Tarih",
    date
  );

  url.searchParams.set(
    "SehirAdi",
    city
  );

  return url.toString();
}
