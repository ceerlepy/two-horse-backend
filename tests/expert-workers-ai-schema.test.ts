import {
  describe,
  expect,
  it
} from "vitest";

import {
  expertResponseSchemaFor
} from "../src/experts/workers-ai-extraction";


describe(
  "expert Workers AI explicit evidence schema",
  () => {
    it(
      "rejects empty races when explicit evidence exists",
      () => {
        const schema =
          expertResponseSchemaFor({
            requireRace:true,
            requireSelectionPerRace:true
          });


        expect(
          schema
            .properties
            .races
            .minItems
        ).toBe(1);


        expect(
          schema
            .properties
            .races
            .items
            .properties
            .selections
            .minItems
        ).toBe(1);
      }
    );
  }
);
