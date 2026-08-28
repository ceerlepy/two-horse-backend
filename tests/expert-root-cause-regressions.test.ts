import {
  describe,
  expect,
  it
} from "vitest";

import {
  expertArticleTextFromHtml
} from "../src/experts/article-text";

import {
  liderformExpectedMainSelections
} from "../src/experts/liderform-completeness";


describe(
  "expert root cause regressions",
  () => {
    it(
      "preserves race and leg line boundaries",
      () => {
        const value =
          expertArticleTextFromHtml(`
            <article>
              <h1>Ankara Tahminleri</h1>
              <p>1.AYAK: 8 KOCAEFE BANKO</p>
              <p>2.AYAK: 5 ERKSAN BANKO</p>
            </article>
          `);

        expect(
          value.text
        ).toContain(
          "1.AYAK: 8 KOCAEFE BANKO"
        );

        expect(
          value.text
        ).toContain(
          "2.AYAK: 5 ERKSAN BANKO"
        );

        expect(
          value.text
        ).toContain("\n");
      }
    );


    it(
      "does not cross city boundary in Liderform",
      () => {
        const text=`
Perşembe Ankara'da 4.6.7. ve Kocaeli'de 5.6.9. Koşuların analizi

Ankara'da yapılacak 4.Koşu olan Handikap yarışta;
(6) ANKARA MAIN ilk isimdir.

Kocaeli'de yapılacak 5.Koşu olan Şartlı yarışta;
(1) KOCAELI MAIN ilk isimdir.
        `;

        expect(
          liderformExpectedMainSelections(
            text,
            [
              "Ankara",
              "Kocaeli"
            ]
          )
        ).toEqual([
          {
            city:"Ankara",
            raceNumber:4,
            horseNumber:6
          },
          {
            city:"Kocaeli",
            raceNumber:5,
            horseNumber:1
          }
        ]);
      }
    );
  }
);
