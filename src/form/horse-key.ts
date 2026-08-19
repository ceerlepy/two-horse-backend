export function horseKeyFromProfileUrl(
  url: string
): string | null {
  try {
    const parsed =
      new URL(url);

    const id =
      parsed.searchParams.get(
        "QueryParameter_AtId"
      ) ??
      parsed.searchParams.get(
        "AtId"
      );

    if (
      id &&
      /^\d+$/.test(id)
    ) {
      return `tjk:${id}`;
    }

    return null;
  } catch {
    return null;
  }
}
