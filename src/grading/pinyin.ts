/**
 * 한어병음 파싱 유틸 (PRD §5.1, §5.2, §8)
 *
 * 핵심: 한 음절을 (성모 initial, 운모 final, 성조 tone)으로 분해한다.
 * 입력은 성조부호(nǐ) / 숫자(ni3) / 무성조(ni) 어느 형태든 허용한다.
 * PRD §8 권장대로 채점 단계에서 로마자와 성조를 분리해 다룬다.
 */

/** 성모 목록(긴 것 우선 매칭). y/w 포함해 일관 처리. */
export const INITIALS = [
  "zh",
  "ch",
  "sh",
  "b",
  "p",
  "m",
  "f",
  "d",
  "t",
  "n",
  "l",
  "g",
  "k",
  "h",
  "j",
  "q",
  "x",
  "r",
  "z",
  "c",
  "s",
  "y",
  "w",
] as const;

/** 성조부호 → {기본모음, 성조번호} 역매핑 테이블 생성 */
const TONE_MARKED: Record<string, string[]> = {
  a: ["ā", "á", "ǎ", "à"],
  e: ["ē", "é", "ě", "è"],
  i: ["ī", "í", "ǐ", "ì"],
  o: ["ō", "ó", "ǒ", "ò"],
  u: ["ū", "ú", "ǔ", "ù"],
  // ü 계열은 canonical 'v'로 통일해 비교 안정화
  v: ["ǖ", "ǘ", "ǚ", "ǜ", "ü"],
};

const MARK_TO_BASE = new Map<string, { base: string; tone: number }>();
for (const [base, marks] of Object.entries(TONE_MARKED)) {
  marks.forEach((ch, idx) => {
    // ü(무성조)는 tone 0으로
    const tone = base === "v" && idx === 4 ? 0 : idx + 1;
    MARK_TO_BASE.set(ch, { base, tone });
  });
}

export interface ParsedSyllable {
  /** 성모. 무성모면 "" */
  initial: string;
  /** 운모(canonical, ü는 v로 통일) */
  final: string;
  /** 성조: 1~4, 경성=0, 미지정=null */
  tone: number | null;
  /** 원본 음절 */
  raw: string;
}

/**
 * 단일 음절을 정규화: 소문자화, 성조부호/숫자 제거 후 성조 추출, ü→v 통일.
 */
export function normalizeSyllable(raw: string): {
  plain: string;
  tone: number | null;
} {
  let s = raw.trim().toLowerCase();
  let tone: number | null = null;

  // 1) 후행 숫자 성조 (ni3, hao0/hao5 → 경성)
  const numMatch = s.match(/([0-5])\s*$/);
  if (numMatch) {
    const n = Number(numMatch[1]);
    tone = n === 5 ? 0 : n;
    s = s.slice(0, numMatch.index);
  }

  // 2) 성조부호 → 기본모음 + 성조
  let plain = "";
  for (const ch of s) {
    const hit = MARK_TO_BASE.get(ch);
    if (hit) {
      if (hit.tone > 0 && tone === null) tone = hit.tone;
      plain += hit.base;
    } else if (ch === "ü") {
      plain += "v";
    } else {
      plain += ch;
    }
  }

  // 3) 남은 'u:' 또는 'v' 표기 통일 (lv, nv 등)
  plain = plain.replace(/u:/g, "v");

  return { plain, tone };
}

/** 성조부호 표(표시용): 기본모음 → [1성,2성,3성,4성] */
const TONE_MARK_DISPLAY: Record<string, string[]> = {
  a: ["ā", "á", "ǎ", "à"],
  e: ["ē", "é", "ě", "è"],
  i: ["ī", "í", "ǐ", "ì"],
  o: ["ō", "ó", "ǒ", "ò"],
  u: ["ū", "ú", "ǔ", "ù"],
  v: ["ǖ", "ǘ", "ǚ", "ǜ"],
};

/**
 * 표시용: plain 음절(소문자, v=ü)에 성조부호를 입혀 반환.
 * 성조 위치 규칙: a>e 우선, ou는 o, 그 외 마지막 모음. 경성/미지정은 부호 없음.
 */
export function applyToneMark(plain: string, tone: number | null): string {
  const display = plain.replace(/v/g, "ü");
  if (tone === null || tone === 0) return display;
  const t = tone - 1;
  if (t < 0 || t > 3) return display;

  // 성조를 입힐 모음 인덱스(원본 plain 기준, v 포함)
  let idx: number;
  if (plain.includes("a")) idx = plain.indexOf("a");
  else if (plain.includes("e")) idx = plain.indexOf("e");
  else if (plain.includes("ou")) idx = plain.indexOf("ou");
  else {
    idx = -1;
    for (let i = plain.length - 1; i >= 0; i--) {
      if ("aeiouv".includes(plain[i]!)) {
        idx = i;
        break;
      }
    }
  }
  if (idx < 0) return display;

  const base = plain[idx]!;
  const marked = TONE_MARK_DISPLAY[base]?.[t];
  if (!marked) return display;
  const out = plain.slice(0, idx) + marked + plain.slice(idx + 1);
  return out.replace(/v/g, "ü");
}

/** 표시용: "ni3" 또는 "ni"(+tone) → "nǐ" */
export function toDisplaySyllable(token: string, tone?: number | null): string {
  const { plain, tone: parsedTone } = normalizeSyllable(token);
  return applyToneMark(plain, tone ?? parsedTone);
}

/** 표시용: 단어 전체를 성조부호 병음으로 변환 */
export function toDisplayWord(pinyin: string, tones?: number[]): string {
  return splitSyllables(pinyin)
    .map((tok, i) => toDisplaySyllable(tok, tones?.[i]))
    .join(" ");
}

/** plain 음절을 (성모, 운모)로 분해 */
export function splitInitialFinal(plain: string): {
  initial: string;
  final: string;
} {
  for (const ini of INITIALS) {
    if (plain.startsWith(ini) && plain.length > ini.length) {
      return { initial: ini, final: plain.slice(ini.length) };
    }
  }
  return { initial: "", final: plain };
}

/** 단어(여러 음절)를 공백/아포스트로피 기준으로 음절 토큰 분리 */
export function splitSyllables(pinyin: string): string[] {
  return pinyin
    .trim()
    .split(/[\s'’]+/)
    .filter(Boolean);
}

/**
 * 단어 전체를 ParsedSyllable[]로 파싱한다.
 * @param pinyin 공백 분리 권장 병음 문자열
 * @param tones  음절별 명시 성조(있으면 우선 사용)
 */
export function parsePinyinWord(
  pinyin: string,
  tones?: number[],
): ParsedSyllable[] {
  const tokens = splitSyllables(pinyin);
  return tokens.map((token, i) => {
    const { plain, tone: parsedTone } = normalizeSyllable(token);
    const { initial, final } = splitInitialFinal(plain);
    const explicit = tones?.[i];
    const tone =
      explicit !== undefined && explicit !== null
        ? explicit === 5
          ? 0
          : explicit
        : parsedTone;
    return { initial, final, tone, raw: token };
  });
}
