import { describe, it, expect } from "vitest";
import { shuffleTokens, checkSentence, hintTokens, splitTrailingPunct } from "./sentence-build";

describe("sentence-build", () => {
  it("shuffleTokens는 같은 토큰 집합을 유지한다", () => {
    const t = ["我", "是", "学生"];
    const s = shuffleTokens(t, 5);
    expect([...s].sort()).toEqual([...t].sort());
    expect(s.length).toBe(3);
  });

  it("길이 2 이상이면 원래 순서 그대로 두지 않는다", () => {
    // seed에 따라 항등이 나오면 회전 처리됨
    const t = ["A", "B"];
    const s = shuffleTokens(t, 2);
    expect(s.join("") === t.join("")).toBe(false);
  });

  it("checkSentence는 정답 순서를 인정한다", () => {
    expect(checkSentence(["我", "是", "学生"], ["我", "是", "学生"])).toBe(true);
    expect(checkSentence(["是", "我", "学生"], ["我", "是", "学生"])).toBe(false);
  });

  it("checkSentence는 같은 문장이 되는 배열도 인정한다(중복 토큰)", () => {
    expect(checkSentence(["好", "好"], ["好", "好"])).toBe(true);
  });

  it("hintTokens는 앞 N개를 반환한다", () => {
    expect(hintTokens(["我", "是", "学生"], 2)).toEqual(["我", "是"]);
    expect(hintTokens(["我"], 5)).toEqual(["我"]);
  });

  describe("splitTrailingPunct (끝 부호 분리 — 마지막 단어 힌트 방지)", () => {
    it("마지막 토큰에 붙은 마침표를 떼어낸다", () => {
      expect(splitTrailingPunct(["请", "给我", "一瓶", "水。"])).toEqual({
        core: ["请", "给我", "一瓶", "水"],
        ending: "。",
      });
    });

    it("부호만으로 된 별도 토큰도 끝으로 옮긴다", () => {
      expect(splitTrailingPunct(["请", "给我", "水", "。"])).toEqual({
        core: ["请", "给我", "水"],
        ending: "。",
      });
    });

    it("끝 부호가 없으면 그대로 둔다", () => {
      expect(splitTrailingPunct(["我", "是", "学生"])).toEqual({
        core: ["我", "是", "学生"],
        ending: "",
      });
    });

    it("물음표/느낌표/라틴 마침표도 처리한다", () => {
      expect(splitTrailingPunct(["你", "好吗？"]).ending).toBe("？");
      expect(splitTrailingPunct(["Wait", "here."]).ending).toBe(".");
    });

    it("떼어낸 core는 셔플·채점에 그대로 쓰인다(부호 미포함)", () => {
      const { core } = splitTrailingPunct(["请", "给我", "一瓶", "水。"]);
      expect(checkSentence(["请", "给我", "一瓶", "水"], core)).toBe(true);
    });
  });
});
