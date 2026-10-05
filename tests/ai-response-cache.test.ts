import {
  describe,
  expect,
  it,
  vi
} from "vitest";

import {
  cachedAiRun
} from "../src/experts/ai-response-cache";


function fakeEnv(
  aiResponse: unknown
) {
  const rows =
    new Map<string, string>();

  const run =
    vi.fn(
      async () => aiResponse
    );

  const env: any = {
    AI: { run },

    DB: {
      prepare(sql: string) {
        let args: unknown[] = [];

        const statement = {
          bind(...values: unknown[]) {
            args = values;
            return statement;
          },

          async first() {
            const json =
              rows.get(String(args[0]));

            return json
              ? { response_json: json }
              : null;
          },

          async run() {
            if (sql.includes("INSERT OR REPLACE")) {
              rows.set(
                String(args[0]),
                String(args[2])
              );
            }

            return {};
          }
        };

        return statement;
      }
    }
  };

  return { env, run, rows };
}


describe(
  "Workers AI response cache",
  () => {
    it(
      "pays for an identical prompt only once",
      async () => {
        const { env, run } =
          fakeEnv({ response: { races: [] } });

        const input = {
          messages: [
            { role: "user", content: "same article" }
          ],
          temperature: 0
        };

        const first =
          await cachedAiRun(env, "m", input, () => true);

        const second =
          await cachedAiRun(env, "m", input, () => true);

        expect(run).toHaveBeenCalledTimes(1);
        expect(first.cacheHit).toBe(false);
        expect(second.cacheHit).toBe(true);
        expect(second.raw).toEqual({ response: { races: [] } });
      }
    );

    it(
      "does not cache a response the caller rejects",
      async () => {
        const { env, run, rows } =
          fakeEnv({ response: "not json" });

        const input = { messages: [] };

        await cachedAiRun(env, "m", input, () => false);
        await cachedAiRun(env, "m", input, () => false);

        expect(run).toHaveBeenCalledTimes(2);
        expect(rows.size).toBe(0);
      }
    );

    it(
      "falls back to a real call when the cache table is unavailable",
      async () => {
        const run =
          vi.fn(async () => ({ response: { races: [] } }));

        const env: any = {
          AI: { run },
          DB: {
            prepare() {
              throw new Error("no such table");
            }
          }
        };

        const result =
          await cachedAiRun(env, "m", {}, () => true);

        expect(run).toHaveBeenCalledTimes(1);
        expect(result.cacheHit).toBe(false);
      }
    );
  }
);


describe(
  "Workers AI response cache bypass",
  () => {
    it(
      "takes a fresh sample on retry and stores it in place of the cached answer",
      async () => {
        let calls = 0;

        const responses = [
          { response: { races: ["incomplete"] } },
          { response: { races: ["complete"] } }
        ];

        const rows =
          new Map<string, string>();

        const env: any = {
          AI: {
            run: async () => responses[calls++]
          },

          DB: {
            prepare(sql: string) {
              let args: unknown[] = [];

              const statement = {
                bind(...values: unknown[]) {
                  args = values;
                  return statement;
                },

                async first() {
                  const json =
                    rows.get(String(args[0]));

                  return json
                    ? { response_json: json }
                    : null;
                },

                async run() {
                  if (sql.includes("INSERT OR REPLACE")) {
                    rows.set(String(args[0]), String(args[2]));
                  }

                  return {};
                }
              };

              return statement;
            }
          }
        };

        const input = { messages: [] };

        await cachedAiRun(env, "m", input, () => true);

        const retry =
          await cachedAiRun(env, "m", input, () => true, { readCache: false });

        const next =
          await cachedAiRun(env, "m", input, () => true);

        expect(calls).toBe(2);
        expect(retry.cacheHit).toBe(false);
        expect(next.cacheHit).toBe(true);
        expect(next.raw).toEqual({ response: { races: ["complete"] } });
      }
    );
  }
);
