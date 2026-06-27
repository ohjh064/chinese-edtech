import { describe, it, expect } from "vitest";
import { gradePinyin } from "./pinyinGrader.js";
import { gradeTones } from "./toneGrader.js";
import { gradeMeaning } from "./meaningGrader.js";
import { gradeSentences } from "./sentenceGrader.js";
import { mapErrorsToScore, applyBaseScore, resolveConfig } from "./scale.js";
import type { StudentAnswer, WordKey } from "./types.js";
import type { AiGradingProvider } from "./providers.js";

const config = resolveConfig();

const keys: WordKey[] = [
  {
    id: "w1",
    hanzi: "你好",
    correctPinyin: "ni hao",
    correctTones: [3, 3],
    acceptableMeanings: ["안녕", "안녕하세요"],
  },
  {
    id: "w2",
    hanzi: "我",
    correctPinyin: "wo",
    correctTones: [3],
    acceptableMeanings: ["나", "저"],
  },
];

describe("mapErrorsToScore (PRD §5.0 척도)", () => {
  it("척도표대로 매핑한다", () => {
    expect(mapErrorsToScore(0)).toBe(25);
    expect(mapErrorsToScore(1)).toBe(20);
    expect(mapErrorsToScore(2)).toBe(20);
    expect(mapErrorsToScore(3)).toBe(15);
    expect(mapErrorsToScore(4)).toBe(15);
    expect(mapErrorsToScore(5)).toBe(10);
    expect(mapErrorsToScore(6)).toBe(10);
    expect(mapErrorsToScore(7)).toBe(5);
    expect(mapErrorsToScore(99)).toBe(5);
  });
  it("부분정답 0.5는 20점 구간", () => {
    expect(mapErrorsToScore(0.5)).toBe(20);
  });
});

describe("applyBaseScore (PRD §5.5 기본점수 하한)", () => {
  it("응시자는 하한 20", () => {
    expect(applyBaseScore(5, "attempted")).toBe(20);
    expect(applyBaseScore(80, "attempted")).toBe(80);
  });
  it("장기 미인정 결석은 10", () => {
    expect(applyBaseScore(80, "long_absent")).toBe(10);
  });
  it("미응시는 0", () => {
    expect(applyBaseScore(0, "not_attempted")).toBe(0);
  });
});

describe("gradePinyin (PRD §5.1)", () => {
  it("정답이면 오류 0, 25점", () => {
    const answers: StudentAnswer[] = [
      { wordId: "w1", studentPinyin: "ni hao" },
      { wordId: "w2", studentPinyin: "wo" },
    ];
    const r = gradePinyin(answers, keys, config);
    expect(r.errors).toBe(0);
    expect(r.score).toBe(25);
  });

  it("PRD 예시: 성모 n→l 오류 1개", () => {
    const answers: StudentAnswer[] = [
      { wordId: "w1", studentPinyin: "li hao" },
      { wordId: "w2", studentPinyin: "wo" },
    ];
    const r = gradePinyin(answers, keys, config);
    expect(r.errors).toBe(1);
    expect(r.details[0]?.issues[0]?.kind).toBe("initial");
  });

  it("PRD 예시: 운모 ao→ou 오류 1개", () => {
    const answers: StudentAnswer[] = [
      { wordId: "w1", studentPinyin: "ni hou" },
      { wordId: "w2", studentPinyin: "wo" },
    ];
    const r = gradePinyin(answers, keys, config);
    expect(r.errors).toBe(1);
    expect(r.details[0]?.issues[0]?.kind).toBe("final");
  });

  it("성조는 병음 채점에 영향 없음", () => {
    const answers: StudentAnswer[] = [
      { wordId: "w1", studentPinyin: "ni2 hao4" }, // 성조만 틀림
      { wordId: "w2", studentPinyin: "wo" },
    ];
    const r = gradePinyin(answers, keys, config);
    expect(r.errors).toBe(0);
  });

  it("카운트 단위 옵션: syllable / word", () => {
    // 한 음절에서 성모+운모 둘 다 틀림 → initial_final=2, syllable=1, word=1
    const answers: StudentAnswer[] = [
      { wordId: "w1", studentPinyin: "lou hao" },
      { wordId: "w2", studentPinyin: "wo" },
    ];
    expect(gradePinyin(answers, keys, resolveConfig()).errors).toBe(2);
    expect(
      gradePinyin(answers, keys, resolveConfig({ pinyinErrorUnit: "syllable" }))
        .errors,
    ).toBe(1);
    expect(
      gradePinyin(answers, keys, resolveConfig({ pinyinErrorUnit: "word" }))
        .errors,
    ).toBe(1);
  });
});

describe("gradeTones (PRD §5.2)", () => {
  it("PRD 예시: [3,3] 정답에 [2,3] → 성조 오류 1개", () => {
    const answers: StudentAnswer[] = [
      { wordId: "w1", studentPinyin: "ni hao", studentTones: [2, 3] },
      { wordId: "w2", studentPinyin: "wo", studentTones: [3] },
    ];
    const r = gradeTones(answers, keys);
    expect(r.errors).toBe(1);
    expect(r.score).toBe(20);
  });

  it("병음 문자열의 숫자 성조에서도 추출한다", () => {
    const answers: StudentAnswer[] = [
      { wordId: "w1", studentPinyin: "ni2 hao3" },
      { wordId: "w2", studentPinyin: "wo3" },
    ];
    const r = gradeTones(answers, keys);
    expect(r.errors).toBe(1);
  });
});

describe("gradeMeaning (PRD §5.3 — 규칙 매칭)", () => {
  it("정확/정규화 일치는 통과", async () => {
    const answers: StudentAnswer[] = [
      { wordId: "w1", studentMeaning: "안녕하세요" },
      { wordId: "w2", studentMeaning: "나" },
    ];
    const r = await gradeMeaning(answers, keys, config);
    expect(r.errors).toBe(0);
    expect(r.needsReview).toBeUndefined();
  });

  it("미작성은 오류 1개", async () => {
    const answers: StudentAnswer[] = [
      { wordId: "w1", studentMeaning: "" },
      { wordId: "w2", studentMeaning: "나" },
    ];
    const r = await gradeMeaning(answers, keys, config);
    expect(r.errors).toBe(1);
  });

  it("AI 미주입 시 매칭 실패분은 needsReview로 위임(자동 오류 처리 안 함)", async () => {
    const answers: StudentAnswer[] = [
      { wordId: "w1", studentMeaning: "하이" },
      { wordId: "w2", studentMeaning: "나" },
    ];
    const r = await gradeMeaning(answers, keys, config);
    expect(r.errors).toBe(0);
    expect(r.needsReview).toEqual(["w1"]);
    expect(r.requiresTeacherConfirm).toBe(true);
  });

  it("동의어 테이블로 통과", async () => {
    const answers: StudentAnswer[] = [
      { wordId: "w1", studentMeaning: "하이" },
      { wordId: "w2", studentMeaning: "나" },
    ];
    const r = await gradeMeaning(answers, keys, config, {
      synonyms: { 안녕: ["하이", "헬로"] },
    });
    expect(r.errors).toBe(0);
  });

  it("AI fallback: reject=오류, partial=가중치(0.5)", async () => {
    const ai: AiGradingProvider = {
      judgeMeanings: async (items) =>
        items.map((it) => ({
          wordId: it.wordId,
          verdict: it.studentMeaning === "인사말" ? "partial" : "reject",
        })),
      checkGrammar: async () => [],
    };
    const answers: StudentAnswer[] = [
      { wordId: "w1", studentMeaning: "인사말" }, // partial
      { wordId: "w2", studentMeaning: "엉뚱" }, // reject
    ];
    const r = await gradeMeaning(
      answers,
      keys,
      resolveConfig({ meaningPartialErrorWeight: 0.5 }),
      { ai },
    );
    expect(r.errors).toBe(1.5);
  });
});

describe("gradeSentences (PRD §5.4)", () => {
  it("작문형: AI 미주입이면 교사 확정 필요, 자동 오류 처리 안 함", async () => {
    const answers: StudentAnswer[] = [
      { wordId: "w1", studentSentence: "你好我是学生" },
      { wordId: "w2", studentSentence: "我是老师" },
    ];
    const r = await gradeSentences(answers, keys, config);
    expect(r.requiresTeacherConfirm).toBe(true);
    expect(r.aiSuggested).toBe(true);
    expect(r.errors).toBe(0);
    expect(r.needsReview).toEqual(["w1", "w2"]);
  });

  it("작문형: 미작성 문장은 자동 오류 1개", async () => {
    const answers: StudentAnswer[] = [
      { wordId: "w1", studentSentence: "" },
      { wordId: "w2", studentSentence: "我是老师" },
    ];
    const r = await gradeSentences(answers, keys, config);
    expect(r.errors).toBe(1);
  });

  it("작문형: AI가 문장별 오류 개수 합산", async () => {
    const ai: AiGradingProvider = {
      judgeMeanings: async () => [],
      checkGrammar: async (items) =>
        items.map((it) => ({
          wordId: it.wordId,
          errorCount: it.wordId === "w1" ? 2 : 0,
          issues: [],
        })),
    };
    const answers: StudentAnswer[] = [
      { wordId: "w1", studentSentence: "我是是学生" },
      { wordId: "w2", studentSentence: "我是老师" },
    ];
    const r = await gradeSentences(answers, keys, config, { ai });
    expect(r.errors).toBe(2);
    expect(r.score).toBe(20);
  });

  it("오류 찾기형: 정답 대조로 완전 자동", async () => {
    const feKeys: WordKey[] = [
      {
        id: "w1",
        hanzi: "我",
        correctPinyin: "wo",
        acceptableMeanings: [],
        errorPrompt: "我是学生吗。",
        acceptableCorrections: ["我是学生。", "我是学生"],
      },
    ];
    const answers: StudentAnswer[] = [
      { wordId: "w1", studentPinyin: "", studentSentence: "我是学生。" },
    ];
    const r = await gradeSentences(
      answers,
      feKeys,
      resolveConfig({ sentenceTaskType: "find_error" }),
    );
    expect(r.errors).toBe(0);
    expect(r.requiresTeacherConfirm).toBeUndefined();
  });
});
