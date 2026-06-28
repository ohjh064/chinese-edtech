import { describe, it, expect } from "vitest";
import { buildQuestions, type QuizItem } from "./quiz-gen";

const items: QuizItem[] = [
  { wordId: "w1", hanzi: "你好", pinyin: "ni hao", tones: [3, 3], meanings: ["안녕", "안녕하세요"], exampleSentence: "你好，我叫小李。" },
  { wordId: "w2", hanzi: "谢谢", pinyin: "xie xie", tones: [4, 4], meanings: ["감사", "고맙다"], exampleSentence: "谢谢你的帮助。" },
  { wordId: "w3", hanzi: "学生", pinyin: "xue sheng", tones: [2, 1], meanings: ["학생"], exampleSentence: "我是学生。" },
  { wordId: "w4", hanzi: "老师", pinyin: "lao shi", tones: [3, 1], meanings: ["선생님"], exampleSentence: "她是老师。" },
];

function correctOption(q: { options: string[]; correctIndex: number }) {
  return q.options[q.correctIndex];
}

describe("buildQuestions (퀴즈 생성기)", () => {
  it("의미 단어→뜻: 정답이 보기에 포함되고 correctIndex가 정확", () => {
    const qs = buildQuestions(items, { mode: "meaning", direction: "forward", seed: 7 });
    expect(qs.length).toBe(4);
    for (const q of qs) {
      expect(q.options.length).toBeGreaterThanOrEqual(2);
      expect(q.correctIndex).toBeGreaterThanOrEqual(0);
      expect(q.correctIndex).toBeLessThan(q.options.length);
      const it = items.find((x) => x.wordId === q.wordId)!;
      expect(it.meanings).toContain(correctOption(q));
      expect(q.prompt).toBe(it.hanzi);
      // 보기 중복 없음
      expect(new Set(q.options).size).toBe(q.options.length);
    }
  });

  it("의미 뜻→단어: prompt가 뜻, 정답이 한자", () => {
    const qs = buildQuestions(items, { mode: "meaning", direction: "reverse", seed: 3 });
    for (const q of qs) {
      const it = items.find((x) => x.wordId === q.wordId)!;
      expect(correctOption(q)).toBe(it.hanzi);
    }
  });

  it("병음: 정답은 무성조 병음, 보기 4개 확보", () => {
    const qs = buildQuestions(items, { mode: "pinyin", direction: "forward", seed: 11 });
    for (const q of qs) {
      const it = items.find((x) => x.wordId === q.wordId)!;
      expect(correctOption(q)).toBe(it.pinyin);
      expect(q.options.length).toBe(4);
      expect(new Set(q.options).size).toBe(4);
    }
  });

  it("성조: 같은 병음에 성조부호, 정답=성조표기", () => {
    const qs = buildQuestions([items[0]!], { mode: "tone", seed: 5 });
    expect(qs.length).toBe(1);
    const q = qs[0]!;
    expect(correctOption(q)).toBe("nǐ hǎo");
    expect(q.options.length).toBeGreaterThanOrEqual(2);
    expect(new Set(q.options).size).toBe(q.options.length);
  });

  it("문장(judge): O/X 보기, grammatical에 맞는 정답", () => {
    const judgeItems: QuizItem[] = [
      { wordId: "w1", hanzi: "我", pinyin: "wo", tones: [3], meanings: ["나"], errorPrompt: "我是学生。", grammatical: true },
      { wordId: "w2", hanzi: "你", pinyin: "ni", tones: [3], meanings: ["너"], errorPrompt: "你是是老师。", grammatical: false },
    ];
    const qs = buildQuestions(judgeItems, { mode: "sentence", sentenceTaskType: "judge", seed: 2 });
    expect(qs.length).toBe(2);
    expect(qs.find((q) => q.wordId === "w1")!.correctIndex).toBe(0); // O
    expect(qs.find((q) => q.wordId === "w2")!.correctIndex).toBe(1); // X
  });

  it("문장(compose): 빈칸 cloze, 정답=한자", () => {
    const qs = buildQuestions(items, { mode: "sentence", sentenceTaskType: "compose", seed: 9 });
    expect(qs.length).toBe(4);
    for (const q of qs) {
      const it = items.find((x) => x.wordId === q.wordId)!;
      expect(correctOption(q)).toBe(it.hanzi);
      expect(q.prompt).toContain("____");
    }
  });

  it("문장(find_error): 정답=수정문", () => {
    const feItems: QuizItem[] = [
      { wordId: "w1", hanzi: "我", pinyin: "wo", tones: [3], meanings: ["나"], errorPrompt: "我是学生吗。", acceptableCorrections: ["我是学生。"] },
      { wordId: "w2", hanzi: "你", pinyin: "ni", tones: [3], meanings: ["너"], errorPrompt: "你是老师吧。", acceptableCorrections: ["你是老师。"] },
    ];
    const qs = buildQuestions(feItems, { mode: "sentence", sentenceTaskType: "find_error", seed: 4 });
    expect(qs.length).toBe(2);
    for (const q of qs) {
      const it = feItems.find((x) => x.wordId === q.wordId)!;
      expect(correctOption(q)).toBe(it.acceptableCorrections![0]);
    }
  });

  it("데이터 없는 단어는 제외(예문 없으면 compose 제외)", () => {
    const noEx: QuizItem[] = [{ wordId: "w1", hanzi: "我", pinyin: "wo", tones: [3], meanings: ["나"] }];
    const qs = buildQuestions(noEx, { mode: "sentence", sentenceTaskType: "compose", seed: 1 });
    expect(qs.length).toBe(0);
  });
});
