import { describe, it, expect } from "vitest";
import {
  MeaningResponseSchema,
  GrammarResponseSchema,
  buildMeaningUserMessage,
  buildGrammarUserMessage,
  toMeaningVerdicts,
  toGrammarResults,
} from "./schemas.js";

describe("AI 프롬프트 빌더", () => {
  it("의미 판정 user 메시지에 모든 wordId/허용정답이 포함된다", () => {
    const msg = buildMeaningUserMessage([
      {
        wordId: "w1",
        hanzi: "你好",
        studentMeaning: "하이",
        acceptableMeanings: ["안녕", "안녕하세요"],
      },
    ]);
    expect(msg).toContain("w1");
    expect(msg).toContain("你好");
    expect(msg).toContain("안녕하세요");
    expect(msg).toContain("```json");
  });

  it("문장 검사 user 메시지는 exampleSentence 없으면 생략한다", () => {
    const msg = buildGrammarUserMessage([
      { wordId: "w1", hanzi: "我", studentSentence: "我是学生" },
    ]);
    expect(msg).toContain("我是学生");
    expect(msg).not.toContain("exampleSentence");
  });
});

describe("응답 스키마 검증 & 정규화", () => {
  it("의미 응답을 파싱해 MeaningVerdict[]로 변환", () => {
    const parsed = MeaningResponseSchema.parse({
      results: [
        { wordId: "w1", verdict: "accept", reason: "동의어" },
        { wordId: "w2", verdict: "reject", reason: "무관" },
      ],
    });
    const verdicts = toMeaningVerdicts(parsed);
    expect(verdicts).toEqual([
      { wordId: "w1", verdict: "accept", reason: "동의어" },
      { wordId: "w2", verdict: "reject", reason: "무관" },
    ]);
  });

  it("잘못된 verdict 값은 스키마에서 거부된다", () => {
    expect(() =>
      MeaningResponseSchema.parse({
        results: [{ wordId: "w1", verdict: "maybe", reason: "" }],
      }),
    ).toThrow();
  });

  it("어법 응답: errorCount 음수/소수를 0 이상 정수로 정규화", () => {
    const parsed = GrammarResponseSchema.parse({
      results: [
        { wordId: "w1", errorCount: 2, issues: [{ message: "어순", span: "是是" }] },
        { wordId: "w2", errorCount: 0, issues: [] },
      ],
    });
    const results = toGrammarResults(parsed);
    expect(results[0]?.errorCount).toBe(2);
    expect(results[0]?.issues[0]).toEqual({ message: "어순", span: "是是" });
    expect(results[1]?.errorCount).toBe(0);
  });
});
