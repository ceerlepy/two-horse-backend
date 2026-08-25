import {
  normalizeExpertSearchText
} from "./text-normalization";


const TURKEY_TIME_ZONE =
  "Europe/Istanbul";


export function buildExpertRaceDateTokens(
  raceDate:
    string,

  options: {
    allowYearless?:
      boolean;
  } = {}
): string[] {
  const parts =
    raceDate
      .split("-")
      .map(
        Number
      );


  if (
    parts.length !== 3
  ) {
    return [
      normalizeExpertSearchText(
        raceDate
      )
    ];
  }


  const [
    year,
    month,
    day
  ] =
    parts;


  if (
    !year ||
    !month ||
    !day
  ) {
    return [
      normalizeExpertSearchText(
        raceDate
      )
    ];
  }


  /*
   * Noon UTC avoids any midnight boundary edge when Intl
   * renders Europe/Istanbul.
   */
  const date =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day,
        12,
        0,
        0
      )
    );


  const monthName =
    new Intl.DateTimeFormat(
      "tr-TR",
      {
        month:
          "long",

        timeZone:
          TURKEY_TIME_ZONE
      }
    )
      .format(
        date
      );


  const dd =
    String(day)
      .padStart(
        2,
        "0"
      );


  const mm =
    String(month)
      .padStart(
        2,
        "0"
      );


  const yy =
    String(year)
      .slice(-2);


  const values = [
    `${year}-${mm}-${dd}`,
    `${year}/${mm}/${dd}`,
    `${dd}-${mm}-${year}`,
    `${dd}.${mm}.${year}`,
    `${dd}/${mm}/${year}`,
    `${day} ${monthName} ${year}`,
    `${day}-${monthName}-${year}`,
    `${dd}${mm}${yy}`,

    /*
     * Some Turkish racing sites use compact D-M-YY
     * without zero padding:
     *
     * 25/8/26 -> 25826
     */
    `${day}${month}${yy}`
  ];


  if (
    options.allowYearless ===
      true
  ) {
    /*
     * Only enabled per-source from config.
     *
     * Needed for article slugs such as:
     * /25-agustos-ankara-tahminleri-.../
     */
    values.push(
      `${day} ${monthName}`,
      `${day}-${monthName}`
    );
  }


  return values
    .map(
      normalizeExpertSearchText
    )
    .filter(
      (
        value,
        index,
        values
      ) =>
        value.length > 0 &&
        values.indexOf(
          value
        ) === index
    );
}
