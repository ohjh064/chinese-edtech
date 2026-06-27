import { describe, it, expect } from "vitest";
import { gradeSubmission } from "./index.js";
import type { StudentAnswer, WordKey } from "./types.js";

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
    hanzi: "我是韩国人",
    correctPinyin: "wo shi han guo ren",
    correctTones: [3, 4, 2, 2, 2],
    acceptableMeanings: ["나는 한국인이다", "저는 한국 사람입니다"],
  },
];

describe("gradeSubmission (PRD §5 통합)", () => {
  it("완벽한 답안: 병음/성조/의미 만점, 문장 미작성 영향 없이 합산", async () => {
    const answers: StudentAnswer[] = [
      {
        wordId: "w1",
        studentPinyin: "ni hao",
        studentTones: [3, 3],
        studentMeaning: "안녕",
      },
      {
        wordId: "w2",
        studentPinyin: "wo shi han guo ren",
        studentTones: [3, 4, 2, 2, 2],
        studentMeaning: "나는 한국인이다",
      },
    ];
    const result = await gradeSubmission({ answers, keys });
    expect(result.pinyin.score).toBe(25);
    expect(result.tone.score).toBe(25);
    expect(result.meaning.score).toBe(25);
    // 문장 미작성 2개 → 오류 2 → 20점
    expect(result.sentence.score).toBe(20);
    expect(result.total).toBe(95);
    expect(result.final).toBe(95);
    expect(result.requiresTeacherConfirm).toBe(true);
  });

  it("기본점수 하한: 응시자는 최소 20점", async () => {
    const answers: StudentAnswer[] = [
      { wordId: "w1", studentPinyin: "xx yy", studentMeaning: "x" },
      { wordId: "w2", studentPinyin: "aa bb cc dd ee", studentMeaning: "y" },
    ];
    const result = await gradeSubmission({
      answers,
      keys,
      status: "attempted",
    });
    expect(result.final).toBeGreaterThanOrEqual(20);
  });

  it("장기 미인정 결석은 10점", async () => {
    const result = await gradeSubmission({
      answers: [],
      keys,
      status: "long_absent",
    });
    expect(result.final).toBe(10);
  });
});
