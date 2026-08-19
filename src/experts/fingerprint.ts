import {
  acquireHttpHtml
} from "../acquisition/http";

import {
  sha256
} from "../shared";

export interface ExpertFingerprint {
  hash: string;
  bodyLength: number;
}

/*
 * Fingerprinting is intentionally HTTP-only.
 *
 * It is an optimization, not a correctness requirement.
 *
 * We do NOT invoke Browser Run merely to determine
 * whether an expert page changed.
 *
 * If HTTP fingerprinting fails, semantic extraction
 * simply continues normally.
 */
export async function expertHttpFingerprint(
  url: string
): Promise<ExpertFingerprint | null> {
  try {
    const acquired =
      await acquireHttpHtml(
        url,
        {
          timeoutMs: 12_000,
          minimumBytes: 1000,
          userAgent:
            "TwoHorse/1.0 (+expert-change-detection)"
        }
      );

    return {
      hash:
        await sha256(
          acquired.html
        ),

      bodyLength:
        acquired.bodyLength
    };
  } catch {
    return null;
  }
}
