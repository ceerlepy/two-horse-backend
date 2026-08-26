import {
  describe,
  expect,
  it
} from "vitest";

import {
  inspectAfaCompleteness
} from "../src/experts/afa-completeness";


describe(
  "AFA race-panel completeness",
  () => {
    const source=`
AFA_RACE_CONTEXT|CITY=Ankara|RACE=1
panel one
AFA_RACE_CONTEXT_END
AFA_RACE_CONTEXT|CITY=Ankara|RACE=2
panel two
AFA_RACE_CONTEXT_END
    `;

    it(
      "fails when an authoritative race panel has no horse evidence",
      () => {
        const result =
          inspectAfaCompleteness(
            {
              races:[
                {
                  city:"Ankara",
                  raceNumber:1,
                  selections:[
                    {
                      horseNumber:1,
                      labels:["favorite"]
                    }
                  ],
                  numberGroups:[]
                },
                {
                  city:"Ankara",
                  raceNumber:2,
                  selections:[],
                  numberGroups:[]
                }
              ]
            },
            source,
            ["Ankara"]
          );

        expect(result.complete).toBe(false);
        expect(result.missing).toEqual([2]);
      }
    );

    it(
      "passes only when every panel produced horse evidence",
      () => {
        const result =
          inspectAfaCompleteness(
            {
              races:[
                {
                  city:"Ankara",
                  raceNumber:1,
                  selections:[
                    {
                      horseNumber:1,
                      labels:["favorite"]
                    }
                  ],
                  numberGroups:[]
                },
                {
                  city:"Ankara",
                  raceNumber:2,
                  selections:[
                    {
                      horseNumber:4,
                      labels:["strong"]
                    }
                  ],
                  numberGroups:[]
                }
              ]
            },
            source,
            ["Ankara"]
          );

        expect(result.complete).toBe(true);
        expect(result.missing).toEqual([]);
      }
    );
  }
);
