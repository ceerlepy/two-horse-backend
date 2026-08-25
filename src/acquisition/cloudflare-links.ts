import type {
  Env
} from "../env";


const DEFAULT_TIMEOUT_MS =
  30_000;


function unwrap(
  value:
    unknown
): unknown {
  if (
    value &&
    typeof value ===
      "object" &&
    "result" in value
  ) {
    return (
      value as {
        result:
          unknown;
      }
    ).result;
  }


  return value;
}


function rawLinkValues(
  payload:
    unknown
): unknown[] {
  if (
    Array.isArray(
      payload
    )
  ) {
    return payload;
  }


  if (
    payload &&
    typeof payload ===
      "object"
  ) {
    const links =
      (
        payload as {
          links?:
            unknown;
        }
      ).links;


    if (
      Array.isArray(
        links
      )
    ) {
      return links;
    }
  }


  return [];
}


function normalizeLinks(
  values:
    unknown[]
): string[] {
  const links =
    values
      .map(
        (
          value:
            unknown
        ): string =>
          String(
            value
          ).trim()
      )
      .filter(
        (
          value:
            string
        ): boolean =>
          value.length >
          0
      );


  return [
    ...new Set<string>(
      links
    )
  ];
}


export interface AcquiredLinks {
  links:
    string[];

  status:
    number;
}


export async function acquireCfLinks(
  env:
    Env,

  url:
    string
): Promise<AcquiredLinks> {
  const response =
    await env.BROWSER.quickAction(
      "links",
      {
        url,

        excludeExternalLinks:
          true,

        gotoOptions: {
          waitUntil:
            "networkidle2",

          timeout:
            DEFAULT_TIMEOUT_MS
        }
      } as any
    );


  if (
    !response.ok
  ) {
    throw new Error(
      `CF_LINKS_HTTP_${response.status}`
    );
  }


  const raw:
    unknown =
    await response.json();


  const payload =
    unwrap(
      raw
    );


  const links =
    normalizeLinks(
      rawLinkValues(
        payload
      )
    );


  if (
    !links.length
  ) {
    throw new Error(
      "CF_LINKS_EMPTY"
    );
  }


  return {
    links,

    status:
      response.status
  };
}
