import type {
  Env
} from "../env";


const DEFAULT_TIMEOUT_MS =
  30_000;


function unwrap(
  value:
    any
): any {
  if (
    value &&
    typeof value ===
      "object" &&
    "result" in value
  ) {
    return value.result;
  }

  return value;
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


  if (!response.ok) {
    throw new Error(
      `CF_LINKS_HTTP_${response.status}`
    );
  }


  const raw:any =
    await response.json();


  const payload =
    unwrap(raw);


  const values =
    Array.isArray(payload)
      ? payload
      : (
          Array.isArray(
            payload?.links
          )
            ? payload.links
            : []
        );


  const links =
    [
      ...new Set(
        values
          .map(
            value =>
              String(value)
                .trim()
          )
          .filter(Boolean)
      )
    ];


  if (!links.length) {
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
