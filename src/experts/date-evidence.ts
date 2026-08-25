import {
  normalizeExpertSearchText
} from "./text-normalization";


const TURKEY_TIME_ZONE =
  "Europe/Istanbul";


export function buildExpertRaceDateTokens(
  raceDate:
    string
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


  return [
    `${year}-${mm}-${dd}`,
    `${year}/${mm}/${dd}`,
    `${dd}-${mm}-${year}`,
    `${dd}.${mm}.${year}`,
    `${dd}/${mm}/${year}`,
    `${day} ${monthName} ${year}`,
    `${day}-${monthName}-${year}`,
    `${dd}${mm}${String(year).slice(-2)}`
  ]
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
