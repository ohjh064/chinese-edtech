import { describe, it, expect } from "vitest";
import { suggestFromHanzi } from "./pinyin-suggest.js";

describe("suggestFromHanzi (PRD §7 한자→병음 자동추천)", () => {
  it("你好 → ni hao [3,3]", () => {
    expect(suggestFromHanzi("你好")).toEqual({ pinyin: "ni hao", tones: [3, 3] });
  });

  it("我是韩国人 → wo shi han guo ren [3,4,2,2,2]", () => {
    expect(suggestFromHanzi("我是韩国人")).toEqual({
      pinyin: "wo shi han guo ren",
      tones: [3, 4, 2, 2, 2],
    });
  });

  it("ü는 v로 변환 (女 → nv [3])", () => {
    expect(suggestFromHanzi("女")).toEqual({ pinyin: "nv", tones: [3] });
  });

  it("빈 입력은 빈 결과", () => {
    expect(suggestFromHanzi("  ")).toEqual({ pinyin: "", tones: [] });
  });
});
