import { describe, it, expect } from "vitest";
import { pinyinToTones, syllableTone, classifyTone } from "./tone";

describe("syllableTone / pinyinToTones", () => {
  it("성조 부호에서 추출", () => {
    expect(syllableTone("nǐ")).toBe(3);
    expect(syllableTone("hǎo")).toBe(3);
    expect(pinyinToTones("nǐ hǎo")).toEqual([3, 3]);
    expect(pinyinToTones("zhōng guó")).toEqual([1, 2]);
  });
  it("숫자 성조에서 추출", () => {
    expect(pinyinToTones("ni3 hao3")).toEqual([3, 3]);
    expect(pinyinToTones("ma1 ma5")).toEqual([1, 0]); // 경성=0
  });
  it("무성조는 0", () => {
    expect(syllableTone("ma")).toBe(0);
  });
});

describe("classifyTone (근사)", () => {
  it("상승=2성", () => {
    expect(classifyTone([0, 1, 2, 3, 4])).toBe(2);
  });
  it("하강=4성", () => {
    expect(classifyTone([4, 3, 2, 1, 0])).toBe(4);
  });
  it("평탄=1성", () => {
    expect(classifyTone([2, 2.1, 1.9, 2, 2])).toBe(1);
  });
  it("디핑=3성", () => {
    expect(classifyTone([1, -1, -3, -1, 1])).toBe(3);
  });
  it("데이터 부족=0", () => {
    expect(classifyTone([1])).toBe(0);
  });
});
