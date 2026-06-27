import { describe, it, expect } from "vitest";
import { aggregateErrors, aggregatePracticeWeakness } from "./analytics.js";

describe("aggregateErrors (PRD §7 오류 히트맵)", () => {
  it("단어×영역 합산 + 학생수 + 영역 평균", () => {
    const agg = aggregateErrors([
      {
        pinyin: [
          { wordId: "w1", errors: 2 },
          { wordId: "w2", errors: 0 },
        ],
        tone: [{ wordId: "w1", errors: 1 }],
        meaning: [],
        sentence: [],
      },
      {
        pinyin: [{ wordId: "w1", errors: 1 }],
        tone: [],
        meaning: [{ wordId: "w2", errors: 1 }],
        sentence: [],
      },
    ]);

    expect(agg.submissions).toBe(2);
    const w1 = agg.byWord.find((w) => w.wordId === "w1")!;
    expect(w1.pinyin).toBe(3);
    expect(w1.tone).toBe(1);
    expect(w1.total).toBe(4);
    expect(w1.studentsWithError).toBe(2);

    const w2 = agg.byWord.find((w) => w.wordId === "w2")!;
    expect(w2.meaning).toBe(1);
    expect(w2.studentsWithError).toBe(1); // 첫 제출은 errors 0이라 미포함

    // total 내림차순 정렬 → w1 먼저
    expect(agg.byWord[0]?.wordId).toBe("w1");
    // 병음 평균 = (2+1)/2 = 1.5
    expect(agg.areaAvgErrors.pinyin).toBeCloseTo(1.5);
  });

  it("빈 입력은 0건", () => {
    const agg = aggregateErrors([]);
    expect(agg.submissions).toBe(0);
    expect(agg.byWord).toEqual([]);
    expect(agg.areaAvgErrors.pinyin).toBe(0);
  });
});

describe("aggregatePracticeWeakness (PRD §6.1 약한 단어 추출)", () => {
  it("오답 시도 수로 약점 단어 정렬", () => {
    const weak = aggregatePracticeWeakness([
      { word_id: "w1", correct_by_area: { pinyin: false, tone: true, meaning: true } },
      { word_id: "w1", correct_by_area: { pinyin: true, tone: true, meaning: true } },
      { word_id: "w2", correct_by_area: { pinyin: true, tone: false, meaning: true } },
      { word_id: "w2", correct_by_area: { pinyin: false, tone: false, meaning: false } },
      { word_id: "w3", correct_by_area: { pinyin: true, tone: true, meaning: true } },
    ]);
    // w2: 2오답, w1: 1오답, w3: 정답뿐 → 제외
    expect(weak.map((w) => w.wordId)).toEqual(["w2", "w1"]);
    expect(weak[0]).toMatchObject({ wordId: "w2", attempts: 2, wrong: 2 });
    expect(weak[1]).toMatchObject({ wordId: "w1", attempts: 2, wrong: 1 });
  });

  it("오답 없으면 빈 배열", () => {
    expect(
      aggregatePracticeWeakness([
        { word_id: "w1", correct_by_area: { pinyin: true, tone: true, meaning: true } },
      ]),
    ).toEqual([]);
  });
});
