/**
 * 한자 → 병음·성조 자동 추천 (PRD §7, 교사 출제 부담 절감).
 * pinyin-pro로 한자를 음절별 숫자성조 병음으로 변환 후, 채점 엔진과 동일한
 * 정규화(normalizeSyllable)로 (성조 제외 병음, 성조 배열)로 분리한다.
 * 교사 정답키 입력 형식과 동일하므로 그대로 채워 넣을 수 있다.
 */
import { pinyin } from "pinyin-pro";
import { normalizeSyllable } from "@/grading/pinyin.js";

export interface PinyinSuggestion {
  /** 성조 제외, 음절 공백 구분 (예: "ni hao") */
  pinyin: string;
  /** 음절별 성조 숫자 (경성=0) */
  tones: number[];
}

export function suggestFromHanzi(hanzi: string): PinyinSuggestion {
  const han = hanzi.trim();
  if (!han) return { pinyin: "", tones: [] };

  // 음절 배열 + 숫자 성조, ü는 v로(채점 엔진 canonical과 일치)
  const tokens = pinyin(han, {
    toneType: "num",
    type: "array",
    v: true,
  }) as string[];

  const plains: string[] = [];
  const tones: number[] = [];
  for (const tok of tokens) {
    const t = (tok ?? "").trim();
    if (!t) continue;
    const { plain, tone } = normalizeSyllable(t);
    if (!plain) continue; // 한자가 아닌 문자(문장부호 등) 건너뜀
    plains.push(plain);
    tones.push(tone ?? 0);
  }
  return { pinyin: plains.join(" "), tones };
}

/**
 * 표시용 병음 — 성조 부호 포함, 비(非)중국어 문자는 제거.
 * 예: "多少錢？" → "duō shǎo qián". 내 단어장 자동 채우기 등 사람이 읽는 표기에 사용.
 */
export function displayPinyin(hanzi: string): string {
  const han = hanzi.trim();
  if (!han) return "";
  return pinyin(han, { toneType: "symbol", type: "string", nonZh: "removed" }).trim();
}
