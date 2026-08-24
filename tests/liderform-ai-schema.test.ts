import {
  describe,
  expect,
  it
} from "vitest";

import {
  expertResponseSchemaFor
} from "../src/experts/workers-ai-extraction";


describe(
  "expert Workers AI schema",
  () => {
    it(
      "requires a main selection per Liderform analysis race",
      () => {
        const schema:
          any =
          expertResponseSchemaFor({
            requireSelectionPerRace:
              true
          });


        expect(
          schema
            .properties
            .races
            .items
            .properties
            .selections
            .minItems
        )
          .toBe(
            1
          );
      }
    );


    it(
      "does not globally force the Liderform contract onto other sources",
      () => {
        const schema:
          any =
          expertResponseSchemaFor();


        expect(
          schema
            .properties
            .races
            .items
            .properties
            .selections
            .minItems
        )
          .toBeUndefined();
      }
    );
  }
);
