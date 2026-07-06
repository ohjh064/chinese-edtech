/**
 * 학생 병음 입력 파서 — 자유 텍스트("ni3 hao3")를 성조 분리 형태로 변환.
 * 응시(TakeForm)·연습(PracticeForm)·학습 5단계(Writing)가 공유한다. (PRD §8: 병음/성조 분리 저장)
 */
import { splitSyllables, normalizeSyllable } from "@/grading/pinyin.js";

/** "ni3 hao3" → { pinyin: "ni hao"(성조 제외), tones: [3,3] }. 성조부호(nǐ) 입력도 허용. */
export function convertPinyin(raw: string): { pinyin: string; tones: number[] } {
  const plains: string[] = [];
  const tones: number[] = [];
  for (const tok of splitSyllables(raw)) {
    const { plain, tone } = normalizeSyllable(tok);
    plains.push(plain);
    tones.push(tone ?? 0);
  }
  return { pinyin: plains.join(" "), tones };
}
