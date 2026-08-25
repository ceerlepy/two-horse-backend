export function normalizeExpertSearchText(
  value:
    unknown
): string {
  return String(
    value ??
    ""
  )
    .normalize(
      "NFKD"
    )
    .toLocaleLowerCase(
      "tr-TR"
    )
    .replace(
      /\p{M}/gu,
      ""
    )
    .replace(/ı/g,"i")
    .replace(/ş/g,"s")
    .replace(/ğ/g,"g")
    .replace(/ü/g,"u")
    .replace(/ö/g,"o")
    .replace(/ç/g,"c")
    .replace(/\s+/g," ")
    .trim();
}


export function cleanExpertInlineText(
  value:
    unknown,

  maxCharacters =
    1400
): string {
  return String(
    value ??
    ""
  )
    .replace(/\u00a0/g," ")
    .replace(/\s+/g," ")
    .trim()
    .slice(
      0,
      maxCharacters
    );
}
