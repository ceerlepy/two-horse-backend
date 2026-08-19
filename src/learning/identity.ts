function normalizedName(
  value:
    string | null | undefined
): string {
  return String(
    value ?? ""
  )
    .normalize("NFKC")
    .toLocaleUpperCase(
      "tr-TR"
    )
    .replace(/\s+/g, " ")
    .trim();
}


function numericIdFromUrl(
  rawUrl:
    string | null | undefined,
  names:
    string[]
): string | null {
  if (!rawUrl) {
    return null;
  }

  try {
    const url =
      new URL(rawUrl);

    for (
      const [
        key,
        value
      ] of url.searchParams
    ) {
      if (
        names.some(
          name =>
            key.toLocaleLowerCase(
              "tr-TR"
            ) ===
            name.toLocaleLowerCase(
              "tr-TR"
            )
        ) &&
        /^\d+$/.test(value)
      ) {
        return value;
      }
    }
  } catch {
    return null;
  }

  return null;
}


export function horseIdentity(
  horseName:
    string | null | undefined,
  profileUrl:
    string | null | undefined
): string {
  const id =
    numericIdFromUrl(
      profileUrl,
      [
        "QueryParameter_AtId",
        "AtId"
      ]
    );

  return id
    ? `tjk-horse:${id}`
    : `horse-name:${normalizedName(
        horseName
      )}`;
}


export function jockeyIdentity(
  jockeyName:
    string | null | undefined,
  profileUrl:
    string | null | undefined
): string | null {
  if (!jockeyName) {
    return null;
  }

  const id =
    numericIdFromUrl(
      profileUrl,
      [
        "QueryParameter_JokeyId",
        "JokeyId"
      ]
    );

  return id
    ? `tjk-jockey:${id}`
    : `jockey-name:${normalizedName(
        jockeyName
      )}`;
}


export function distanceBand(
  distance:
    number | null | undefined
): "sprint" | "middle" | "route" {
  if (
    distance != null &&
    distance < 1300
  ) {
    return "sprint";
  }

  if (
    distance != null &&
    distance <= 1700
  ) {
    return "middle";
  }

  return "route";
}
