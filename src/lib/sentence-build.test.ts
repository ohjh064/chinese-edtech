import { describe, it, expect } from "vitest";
import { shuffleTokens, checkSentence, hintTokens } from "./sentence-build";

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
});
