import {
  describe,
  expect,
  it
} from "vitest";

import {
  buildGanyanTargetUrl,
  discoverGanyanCityStates
} from "../src/experts/structured-ganyan-canavari";


describe(
  "Ganyan Canavari structured discovery",
  () => {
    it(
      "discovers venue ids from site state without city hardcoding",
      () => {
        const states =
          discoverGanyanCityStates(
            `
<select id="city">
  <option value="5">Ankara</option>
  <option value="9">Kocaeli</option>
  <option value="4">İzmir</option>
</select>
`,
            [
              "Ankara",
              "Kocaeli",
              "İzmir"
            ]
          );


        expect(states)
          .toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                city:"Ankara",
                venueValue:"5"
              }),
              expect.objectContaining({
                city:"Kocaeli",
                venueValue:"9"
              }),
              expect.objectContaining({
                city:"İzmir",
                venueValue:"4"
              })
            ])
          );
      }
    );


    it(
      "builds target from runtime venue state",
      () => {
        const url =
          buildGanyanTargetUrl(
            "https://www.ganyancanavari.com.tr/",
            "2026-08-25",
            "İzmir",
            "4",
            "/site/{yyyy}/{mm}/{dd}/{venueValue}/{citySlug}/galoplar-ozet.html"
          );


        expect(url)
          .toBe(
            "https://www.ganyancanavari.com.tr/site/2026/08/25/4/izmir/galoplar-ozet.html"
          );
      }
    );
  }
);
