import {
  normalizeExpertSearchText
} from "../text-normalization";


const MONTH_TITLES = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık"
];


const MONTH_SLUGS = [
  "ocak",
  "subat",
  "mart",
  "nisan",
  "mayis",
  "haziran",
  "temmuz",
  "agustos",
  "eylul",
  "ekim",
  "kasim",
  "aralik"
];


export function raceDateParts(
  raceDate:string
) {
  const [
    yearRaw,
    monthRaw,
    dayRaw
  ] =
    raceDate.split("-");

  const year =
    Number(yearRaw);

  const month =
    Number(monthRaw);

  const day =
    Number(dayRaw);

  if (
    !year ||
    !month ||
    !day ||
    month < 1 ||
    month > 12
  ) {
    throw new Error(
      `INVALID_RACE_DATE:${raceDate}`
    );
  }

  return {
    year,
    month,
    day,

    monthTitle:
      MONTH_TITLES[
        month-1
      ],

    monthSlug:
      MONTH_SLUGS[
        month-1
      ]
  };
}


export function simpleSlug(
  value:string
):string {
  return normalizeExpertSearchText(
    value
  )
    .replace(/\s+/g,"-");
}


export function dateSearchText(
  raceDate:string,
  city?:string
):string {
  const parts =
    raceDateParts(
      raceDate
    );

  return [
    city,
    parts.day,
    parts.monthTitle,
    parts.year
  ]
    .filter(
      value =>
        value !==
        undefined &&
        value !==
        null &&
        String(value)
          .trim()
          .length >
          0
    )
    .join(" ");
}


export function wordpressSearchUrl(
  root:string,
  query:string
):string {
  const url =
    new URL(root);

  url.searchParams.set(
    "s",
    query
  );

  return url.toString();
}
