import {
  clamp,
  round
} from "../scoring/math";

function normalize(
  value: unknown
): string {
  return String(
    value ?? ""
  )
    .toLocaleLowerCase(
      "tr-TR"
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}

function trackTokens(
  track:
    string | null | undefined
): string[] {
  const normalized =
    normalize(track);

  if (
    normalized === "çim"
  ) {
    return [
      "çim",
      "cim"
    ];
  }

  if (
    normalized === "kum"
  ) {
    return [
      "kum"
    ];
  }

  if (
    normalized ===
    "sentetik"
  ) {
    return [
      "sentetik"
    ];
  }

  return [];
}

function explicitlyRelevant(
  comment: string,
  track:
    string | null | undefined
): boolean {
  const generic =
    [
      "pist",
      "mesafe",
      "saha",
      "zemin"
    ].some(
      token =>
        comment.includes(
          token
        )
    );

  const surface =
    trackTokens(
      track
    ).some(
      token =>
        comment.includes(
          token
        )
    );

  return (
    generic ||
    surface
  );
}

const POSITIVE = [
  "pist mesafe uygun",
  "pist ve mesafe uygun",
  "piste uygun",
  "pisti uygun",
  "pisti sever",
  "pisti seviyor",
  "mesafeyi sever",
  "mesafeyi seviyor",
  "mesafe uygun",
  "saha uygun",
  "zemin uygun",
  "bu pistte etkili",
  "bu mesafede etkili",
  "çimde etkili",
  "cimde etkili",
  "kumda etkili",
  "sentetikte etkili",
  "çimi sever",
  "cimi sever",
  "kumu sever",
  "sentetiği sever",
  "sentetigi sever"
];

const NEGATIVE = [
  "pist uygun değil",
  "pist uygun degil",
  "pisti sevmez",
  "mesafe uygun değil",
  "mesafe uygun degil",
  "mesafe uzun gelir",
  "mesafe kısa gelir",
  "mesafe kisa gelir",
  "saha uygun değil",
  "saha uygun degil",
  "zemin uygun değil",
  "zemin uygun degil",
  "çimde etkisiz",
  "cimde etkisiz",
  "kumda etkisiz",
  "sentetikte etkisiz"
];

export function scoreExpertFieldComments(
  comments:
    Array<
      string | null | undefined
    >,
  track:
    string | null | undefined
): number | null {
  let positive = 0;
  let negative = 0;
  let relevant = 0;

  for (
    const raw of comments
  ) {
    const comment =
      normalize(raw);

    if (
      !comment ||
      !explicitlyRelevant(
        comment,
        track
      )
    ) {
      continue;
    }

    const positiveHit =
      POSITIVE.some(
        phrase =>
          comment.includes(
            phrase
          )
      );

    const negativeHit =
      NEGATIVE.some(
        phrase =>
          comment.includes(
            phrase
          )
      );

    if (
      !positiveHit &&
      !negativeHit
    ) {
      continue;
    }

    relevant += 1;

    if (positiveHit) {
      positive += 1;
    }

    if (negativeHit) {
      negative += 1;
    }
  }

  if (!relevant) {
    return null;
  }

  const signal =
    (
      positive -
      negative
    ) /
    relevant;

  return round(
    clamp(
      50 +
      40 *
      signal,
      0,
      100
    ),
    1
  );
}
