import {
  describe,
  expect,
  it
} from "vitest";

import {
  isoTrainingDate,
  parseRaceTraining,
  raceCodeFromPerformanceUrl,
  trainingUrlForRace
} from "../src/training/parser";

import {
  TJK_BROWSER_USER_AGENT,
  defaultUserAgentFor
} from "../src/acquisition/http";


/* Trimmed copy of TJK's live fragment for race 227788 (2026-10-04). */
const FRAGMENT = String.raw`

    <div id="hipodromSemasi-227788" class="test" style=" text-align: center; margin:5px 0 5px;">
            <div id="KosuIdmanGaloplari" class="test" style="">
                <table id="KosuIdmanGaloplari_table" summary="Kosular" class="tablesorter">
                    <thead>
                        <tr>
                            <th scope="col" style="text-align:center">At No</th>
                            <th scope="col" style="text-align:center">At Adı</th>
                            <th scope="col" style="text-align:center">2200m</th>
                            <th scope="col" style="text-align:center">2000m</th>
                            <th scope="col" style="text-align:center">1800m</th>
                            <th scope="col" style="text-align:center">1600m</th>
                            <th scope="col" style="text-align:center">1400m</th>
                            <th scope="col" style="text-align:center">1200m</th>
                            <th scope="col" style="text-align:center">1000m</th>
                            <th scope="col" style="text-align:center">800m</th>
                            <th scope="col" style="text-align:center">600m</th>
                            <th scope="col" style="text-align:center">400m</th>
                            <th scope="col" style="text-align:center">200m</th>
                            <th scope="col" style="text-align:center;max-width:30px">İdman <br />Tarihi</th>
                            <th scope="col" style="text-align:center">Pist </th>
                            <th scope="col" style="text-align:center;max-width:70px">Pist <br />Durumu</th>
                            <th scope="col" style="text-align:center;max-width:70px">İdman <br />Türü</th>
                            <th scope="col" style="text-align:center;max-width:70px">İdman <br />Hipodromu</th>
                            <th scope="col" style="text-align:center;max-width:30px">İdman <br />Jokeyi</th>
                            <th scope="col" style="text-align:center">Detay</th>
                            <th scope="col" style="text-align:center">Video</th>
                        </tr>
                    </thead>
                    <tbody>
                                <tr id="" class="even">
                                    <td id="" style="text-align:center"><b> 1 </b></td>
                                    <td id="" style="text-align:left;"><a target="_blank" href="/TR/YarisSever/Query/Page/IdmanIstatistikleri?1=1&QueryParameter_ATADI=AZAPKAPI"> AZAPKAPI</a> </td>
                                    <td id="" style="text-align:left">  </td>
                                    <td id="" style="text-align:left">  </td>
                                    <td id="" style="text-align:left">  </td>
                                    <td id="" style="text-align:left">  </td>
                                    <td id="" style="text-align:left">  </td>
                                    <td id="" style="text-align:left">  </td>
                                    <td id="" style="text-align:left">  </td>
                                    <td id="" style="text-align:left">  </td>
                                    <td id="" style="text-align:left"> 0.39.30 </td>
                                    <td id="" style="text-align:left"> 0.26.00 </td>
                                    <td id="" style="text-align:left">  </td>
                                    <td id="" style="text-align:left">
                                            <span>2.10.2026</span>
                                    </td>
                                    <td id="" style="text-align:left"> Kum </td>
                                    <td id="" style="text-align:left"> İ&#231; </td>
                                    <td id="" style="text-align:left"> Galop </td>
                                    <td id="" style="text-align:left"> İstanbul </td>
                                    <td id="" style="text-align:left"> YUNUS YALVAN </td>
                                    <td id="" style="text-align:left"> <a target="_blank" onclick="openDetayPopup('/TR/YarisSever/Info/idmanpistiDetay?QueryParameter_Id=837731')" href="/TR/YarisSever/Info/idmanpistiDetay?QueryParameter_Id=837731">Detay </a> </td>
                                    <td id="" style="text-align:center">
                                        <a target="_blank" href="../idmanpisti/Kosu?KosuKodu=227788&amp;Atkodu=94977">      <img style="width:20px; height:20px; float:right;" src="https://medya-cdn.tjk.org/medyaftp/video-play20x20.png" alt="" /></a>
                                    </td>
                                </tr>
                                <tr id="" class="odd">
                                    <td id="" style="text-align:center"><b> 2 </b></td>
                                    <td id="" style="text-align:left;"><a target="_blank" href="/TR/YarisSever/Query/Page/IdmanIstatistikleri?1=1&QueryParameter_ATADI=UFKUN &#214;TESİ"> UFKUN &#214;TESİ</a> </td>
                                    <td id="" style="text-align:left">  </td>
                                    <td id="" style="text-align:left">  </td>
                                    <td id="" style="text-align:left">  </td>
                                    <td id="" style="text-align:left">  </td>
                                    <td id="" style="text-align:left">  </td>
                                    <td id="" style="text-align:left">  </td>
                                    <td id="" style="text-align:left"> 1.11.00 </td>
                                    <td id="" style="text-align:left">  </td>
                                    <td id="" style="text-align:left">  </td>
                                    <td id="" style="text-align:left"> 0.26.90 </td>
                                    <td id="" style="text-align:left">  </td>
                                    <td id="" style="text-align:left">
                                            <span>25.09.2026</span>
                                    </td>
                                    <td id="" style="text-align:left"> Kum </td>
                                    <td id="" style="text-align:left">  </td>
                                    <td id="" style="text-align:left"> Galop </td>
                                    <td id="" style="text-align:left"> Kocaeli </td>
                                    <td id="" style="text-align:left"> ABD&#220;L KADİR ŞAHİN </td>
                                    <td id="" style="text-align:left"> <a target="_blank" onclick="openDetayPopup('/TR/YarisSever/Info/idmanpistiDetay?QueryParameter_Id=834266')" href="/TR/YarisSever/Info/idmanpistiDetay?QueryParameter_Id=834266">Detay </a> </td>
                                    <td id="" style="text-align:center">
                                    </td>
                                </tr></tbody></table></div></div>`;

const PAGE =
  trainingUrlForRace("227788");


describe("parseRaceTraining", () => {
  it("reads each runner's latest gallop from TJK's table", () => {
    const rows = parseRaceTraining(FRAGMENT, PAGE);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      horseNumber: 1,
      horseName: "AZAPKAPI",
      trainingDate: "2026-10-02",
      track: "Kum",
      trackCondition: "İç",
      trainingType: "Galop",
      hippodrome: "İstanbul",
      jockey: "YUNUS YALVAN",
      splits: [
        { distanceMeters: 600, time: "0.39.30" },
        { distanceMeters: 400, time: "0.26.00" }
      ],
      detailUrl:
        "https://www.tjk.org/TR/YarisSever/Info/idmanpistiDetay?QueryParameter_Id=837731",
      videoUrl:
        "https://www.tjk.org/TR/YarisSever/Info/idmanpisti/Kosu?KosuKodu=227788&Atkodu=94977"
    });
  });

  it("keeps empty cells as null and omits a missing video", () => {
    const [, second] = parseRaceTraining(FRAGMENT, PAGE);

    expect(second.horseName).toBe("UFKUN ÖTESİ");
    expect(second.trackCondition).toBeNull();
    expect(second.videoUrl).toBeNull();
    expect(second.splits).toEqual([
      { distanceMeters: 1000, time: "1.11.00" },
      { distanceMeters: 400, time: "0.26.90" }
    ]);
  });

  it("returns nothing for a page without the training table", () => {
    expect(parseRaceTraining("<html><body>504</body></html>", PAGE)).toEqual([]);
  });
});


describe("training helpers", () => {
  it("takes the race code from TJK's AtPerformans link", () => {
    expect(
      raceCodeFromPerformanceUrl(
        "https://www.tjk.org/TR/YarisSever/Query/Page/AtPerformans?1=1&QueryParameter_KKODU=227777&QueryParameter_MESAFE=1200"
      )
    ).toBe("227777");
    expect(raceCodeFromPerformanceUrl(null)).toBeNull();
  });

  it("converts TJK dates to ISO", () => {
    expect(isoTrainingDate("2.10.2026")).toBe("2026-10-02");
    expect(isoTrainingDate("")).toBeNull();
  });

  it("sends a browser user-agent only to TJK", () => {
    expect(defaultUserAgentFor("https://www.tjk.org/x")).toBe(TJK_BROWSER_USER_AGENT);
    expect(defaultUserAgentFor("https://example.com/")).toMatch(/^TwoHorse\//);
  });
});
