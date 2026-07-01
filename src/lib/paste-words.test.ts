import { describe, it, expect } from "vitest";
import { parsePastedWords } from "./paste-words";

describe("parsePastedWords", () => {
  it("탭 구분 3열(단어·의미·예문)", () => {
    const text = "你好\t안녕\t你好吗？\n谢谢\t고맙다\t";
    expect(parsePastedWords(text)).toEqual([
      { hanzi: "你好", meaning: "안녕", example: "你好吗？" },
      { hanzi: "谢谢", meaning: "고맙다", example: "" },
    ]);
  });
  it("헤더 행·빈 줄 무시", () => {
    const text = "단어\t의미\t예문\n\n学生\t학생\t";
    expect(parsePastedWords(text)).toEqual([
      { hanzi: "学生", meaning: "학생", example: "" },
    ]);
  });
  it("한자 없는 행은 제외, 콤마 fallback", () => {
    const text = "\t안녕\n老师,선생님";
    expect(parsePastedWords(text)).toEqual([
      { hanzi: "老师", meaning: "선생님", example: "" },
    ]);
  });
  it("빈 입력은 빈 배열", () => {
    expect(parsePastedWords("")).toEqual([]);
  });
});
