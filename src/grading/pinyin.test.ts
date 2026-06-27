import { describe, it, expect } from "vitest";
import {
  normalizeSyllable,
  splitInitialFinal,
  parsePinyinWord,
  applyToneMark,
  toDisplaySyllable,
  toDisplayWord,
} from "./pinyin.js";

describe("normalizeSyllable (PRD §8 — 성조부호/숫자/무성조 처리)", () => {
  it("성조부호에서 성조와 plain을 분리한다", () => {
    expect(normalizeSyllable("nǐ")).toEqual({ plain: "ni", tone: 3 });
    expect(normalizeSyllable("hǎo")).toEqual({ plain: "hao", tone: 3 });
    expect(normalizeSyllable("mā")).toEqual({ plain: "ma", tone: 1 });
  });

  it("숫자 성조를 처리한다 (ni3, hao0=경성)", () => {
    expect(normalizeSyllable("ni3")).toEqual({ plain: "ni", tone: 3 });
    expect(normalizeSyllable("hao0")).toEqual({ plain: "hao", tone: 0 });
    expect(normalizeSyllable("de5")).toEqual({ plain: "de", tone: 0 });
  });

  it("무성조는 tone=null", () => {
    expect(normalizeSyllable("ni")).toEqual({ plain: "ni", tone: null });
  });

  it("ü/v/u: 표기를 canonical v로 통일한다", () => {
    expect(normalizeSyllable("lǜ").plain).toBe("lv");
    expect(normalizeSyllable("lv4").plain).toBe("lv");
    expect(normalizeSyllable("nu:3").plain).toBe("nv");
  });
});

describe("splitInitialFinal (성모/운모 분해)", () => {
  it("기본 성모/운모", () => {
    expect(splitInitialFinal("ni")).toEqual({ initial: "n", final: "i" });
    expect(splitInitialFinal("hao")).toEqual({ initial: "h", final: "ao" });
  });
  it("권설음 zh/ch/sh를 우선 매칭", () => {
    expect(splitInitialFinal("zhong")).toEqual({
      initial: "zh",
      final: "ong",
    });
    expect(splitInitialFinal("shi")).toEqual({ initial: "sh", final: "i" });
  });
  it("무성모 음절", () => {
    expect(splitInitialFinal("an")).toEqual({ initial: "", final: "an" });
    expect(splitInitialFinal("er")).toEqual({ initial: "", final: "er" });
  });
});

describe("parsePinyinWord", () => {
  it("你好를 음절별로 파싱한다", () => {
    const parsed = parsePinyinWord("nǐ hǎo");
    expect(parsed).toEqual([
      { initial: "n", final: "i", tone: 3, raw: "nǐ" },
      { initial: "h", final: "ao", tone: 3, raw: "hǎo" },
    ]);
  });

  it("명시 성조 배열이 부호보다 우선한다", () => {
    const parsed = parsePinyinWord("ni hao", [3, 3]);
    expect(parsed.map((p) => p.tone)).toEqual([3, 3]);
  });
});

describe("applyToneMark / toDisplay (PRD §8 숫자→부호 미리보기)", () => {
  it("성조 위치 규칙: a>e, ou는 o, 그 외 마지막 모음", () => {
    expect(applyToneMark("hao", 3)).toBe("hǎo"); // a 우선
    expect(applyToneMark("hou", 4)).toBe("hòu"); // ou는 o
    expect(applyToneMark("ni", 3)).toBe("nǐ"); // 마지막 모음
    expect(applyToneMark("xue", 2)).toBe("xué"); // e 우선
  });

  it("ü(v) 처리 및 경성/미지정은 부호 없음", () => {
    expect(applyToneMark("lv", 4)).toBe("lǜ");
    expect(applyToneMark("lv", 0)).toBe("lü");
    expect(applyToneMark("ma", null)).toBe("ma");
  });

  it("숫자 성조 입력을 부호로 변환", () => {
    expect(toDisplaySyllable("ni3")).toBe("nǐ");
    expect(toDisplayWord("ni3 hao3")).toBe("nǐ hǎo");
    expect(toDisplayWord("ni hao", [2, 3])).toBe("ní hǎo");
  });
});
