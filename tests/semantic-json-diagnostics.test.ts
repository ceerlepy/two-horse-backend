import {
  describe,
  expect,
  it
} from "vitest";

import {
  analyzeCfJsonFailure
} from "../src/acquisition/semantic-json";


describe(
  "Cloudflare JSON failure diagnostics",
  () => {
    it(
      "detects malformed raw AI JSON and preserves the tail",
      () => {
        const raw =
          '{"picks":[{"city":"Bursa","raceNumber":6},{"city":"Bursa","raceN';


        const body =
          JSON.stringify({
            success:
              false,

            errors: [
              {
                message:
                  "Unable to form JSON"
              }
            ],

            rawAiResponse:
              raw
          });


        const analysis =
          analyzeCfJsonFailure(
            422,
            body,
            "1234",
            "application/json"
          );


        expect(
          analysis.status
        ).toBe(422);


        expect(
          analysis.rawAiResponsePresent
        ).toBe(true);


        expect(
          analysis.rawAiResponseJsonValid
        ).toBe(false);


        expect(
          analysis.rawAiResponseJsonParseError
        ).toBeTruthy();


        expect(
          analysis.rawAiResponseTail
        ).toContain(
          '"raceN'
        );
      }
    );


    it(
      "recognizes a syntactically valid raw AI document",
      () => {
        const raw =
          JSON.stringify({
            picks: [
              {
                city:
                  "Bursa",

                raceNumber:
                  6,

                horseNumber:
                  2,

                horseName:
                  "BIG HONEY",

                comment:
                  "kazanmaya yakındır",

                labels: [
                  "strong"
                ]
              }
            ]
          });


        const body =
          JSON.stringify({
            success:
              false,

            errors: [
              {
                message:
                  "Unable to form JSON"
              }
            ],

            rawAiResponse:
              raw
          });


        const analysis =
          analyzeCfJsonFailure(
            422,
            body
          );


        expect(
          analysis.rawAiResponseJsonValid
        ).toBe(true);


        expect(
          analysis.rawAiResponsePickCount
        ).toBe(1);


        expect(
          analysis.rawAiResponseFirstPickKeys
        ).toContain(
          "horseNumber"
        );
      }
    );
  }
);
