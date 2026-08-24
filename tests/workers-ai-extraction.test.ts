import {
  describe,
  expect,
  it
} from "vitest";

import {
  EXPERT_AI_MAX_OUTPUT_TOKENS,
  parseWorkersAiExpertResponse
} from "../src/experts/workers-ai-extraction";


describe(
  "Workers AI expert structured response",
  () => {
    it(
      "uses a 4096 output-token ceiling",
      () => {
        expect(
          EXPERT_AI_MAX_OUTPUT_TOKENS
        )
          .toBe(
            4096
          );
      }
    );


    it(
      "accepts object response envelopes",
      () => {
        const result =
          parseWorkersAiExpertResponse({
            response: {
              races: [
                {
                  city:
                    "Bursa",

                  raceNumber:
                    6,

                  selections: [
                    {
                      horseNumber:
                        2,

                      horseName:
                        "BIG HONEY",

                      labels: [
                        "strong"
                      ]
                    }
                  ],

                  numberGroups: [
                    {
                      label:
                        "rival",

                      horseNumbers: [
                        6,
                        1,
                        8
                      ]
                    }
                  ]
                }
              ]
            }
          });


        expect(
          result.races
        )
          .toHaveLength(
            1
          );
      }
    );


    it(
      "accepts JSON string response envelopes",
      () => {
        const result =
          parseWorkersAiExpertResponse({
            response:
              JSON.stringify({
                races: []
              })
          });


        expect(
          result.races
        )
          .toEqual(
            []
          );
      }
    );
  }
);
