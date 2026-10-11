import {
  describe,
  expect,
  it
} from "vitest";

import {
  discoveryCandidatesToVerify,
  type LooseCandidate
} from "../src/experts/adapters/verified-article";


function candidate(
  url:string,
  score:number,
  city:string
):LooseCandidate {
  return {
    url,
    text:url,
    score,
    matchedCities:[city],
    dateEvidence:true,
    topicEvidence:true,
    fromUrl:url,
    discoveryStage:score === 100 ? "direct-source-url" : "http"
  };
}


describe("discoveryCandidatesToVerify", () => {
  /*
   * Live 10.10.2026: three HorseTurk cities x two direct URL
   * patterns filled all six slots, so the Diyarbakır article found
   * by search (third pattern) was never verified.
   */
  it("does not let already-tried direct URLs crowd out discovered articles", () => {
    const direct = [
      "at-yarisi-tahminleri-ankara-10-ekim-2026",
      "altili-ganyan-tahmin-ankara-10-ekim-2026",
      "at-yarisi-tahminleri-izmir-10-ekim-2026",
      "altili-ganyan-tahmin-izmir-10-ekim-2026",
      "at-yarisi-tahminleri-diyarbakir-10-ekim-2026",
      "altili-ganyan-tahmin-diyarbakir-10-ekim-2026"
    ].map(slug => candidate(`https://www.horseturk.com/${slug}/`, 100, "x"));

    const found =
      candidate("https://www.horseturk.com/at-yarislari-tahmin-diyarbakir-10-ekim-2026/", 40, "Diyarbakır");

    const ranked =
      discoveryCandidatesToVerify(
        [...direct, found],
        new Set(direct.map(value => value.url)),
        6
      );

    expect(ranked.map(value => value.url)).toEqual([found.url]);
  });

  it("ranks the rest best first within the limit", () => {
    const ranked =
      discoveryCandidatesToVerify(
        [candidate("https://a/1", 10, "A"), candidate("https://a/2", 30, "A"), candidate("https://a/3", 20, "A")],
        new Set(),
        2
      );

    expect(ranked.map(value => value.url)).toEqual(["https://a/2","https://a/3"]);
  });
});
