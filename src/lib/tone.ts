/**
 * 성조 코칭 유틸 (PRD §11) — 순수 함수(테스트 가능).
 * pinyinToTones: 병음 문자열(부호/숫자/무성조)에서 음절별 성조번호 추출.
 * classifyTone: 정규화된 피치 윤곽(반음 단위)을 1~4성으로 근사 분류(참고용).
 */

const TONE_MARKS: Record<string, number> = {
  ā: 1, á: 2, ǎ: 3, à: 4,
  ē: 1, é: 2, ě: 3, è: 4,
  ī: 1, í: 2, ǐ: 3, ì: 4,
  ō: 1, ó: 2, ǒ: 3, ò: 4,
  ū: 1, ú: 2, ǔ: 3, ù: 4,
  ǖ: 1, ǘ: 2, ǚ: 3, ǜ: 4,
};

/** 한 음절의 성조: 1~4, 경성/무성조=0 */
export function syllableTone(raw: string): number {
  const s = raw.trim().toLowerCase();
  const digit = s.match(/([0-5])\s*$/);
  if (digit) {
    const n = Number(digit[1]);
    return n === 5 ? 0 : n;
  }
  for (const ch of s) {
    const t = TONE_MARKS[ch];
    if (t != null) return t;
  }
  return 0;
}

/** 병음 문자열 → 음절별 성조 배열 */
export function pinyinToTones(pinyin: string): number[] {
  return pinyin
    .trim()
    .split(/[\s·/]+/)
    .filter(Boolean)
    .map(syllableTone);
}

export function toneName(n: number): string {
  return n === 1 ? "1성(고평)" : n === 2 ? "2성(상승)" : n === 3 ? "3성(내려갔다 오름)" : n === 4 ? "4성(하강)" : "경성";
}

function avg(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

// 분류 임계치(반음). 느슨하게 — 브라우저 근사이므로 참고용.
const RISE = 1.5; // 상승/하강 판정 기울기
const FLAT = 2.5; // 평탄 판정 범위
const DIP = 1.8; // 디핑(3성) 깊이

/**
 * 정규화된 피치 윤곽(반음, 중앙값=0 권장)을 성조로 근사 분류.
 * 1성=평탄, 2성=상승, 3성=중간이 양끝보다 낮음(디핑), 4성=하강. 불충분하면 0.
 */
export function classifyTone(contour: number[]): number {
  const pts = contour.filter((x) => Number.isFinite(x));
  if (pts.length < 3) return 0;
  const n = pts.length;
  const third = Math.max(1, Math.floor(n / 3));
  const startAvg = avg(pts.slice(0, third));
  const endAvg = avg(pts.slice(n - third));
  let minV = Infinity;
  let maxV = -Infinity;
  let minIdx = 0;
  for (let i = 0; i < n; i++) {
    const v = pts[i] as number;
    if (v < minV) {
      minV = v;
      minIdx = i;
    }
    if (v > maxV) maxV = v;
  }
  const slope = endAvg - startAvg;
  const range = maxV - minV;

  // 3성: 최저점이 중앙부에 있고 양끝보다 확연히 낮음
  const midLow = minIdx > n * 0.2 && minIdx < n * 0.8 && minV < startAvg - DIP && minV < endAvg - DIP;
  if (midLow) return 3;
  if (slope > RISE) return 2;
  if (slope < -RISE) return 4;
  if (range < FLAT) return 1;
  return slope >= 0 ? 2 : 4;
}
