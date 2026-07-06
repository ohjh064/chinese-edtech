/**
 * Sentence Builder 순수 유틸 (PRD §6) — 토큰 셔플 / 정답 비교 / 힌트. 네트워크 없음, 테스트 가능.
 * 채점은 서버에서 수행(정답 토큰 순서는 학생에게 미전송).
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 토큰을 시드 기반으로 섞는다(원래 순서와 다르게 보장하려 1회 재시도). */
export function shuffleTokens(tokens: string[], seed = 1): string[] {
  const rng = mulberry32(seed);
  const a = tokens.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  // 길이 2 이상인데 원래 순서 그대로면 한 번 회전
  if (a.length > 1 && a.every((t, i) => t === tokens[i])) {
    a.push(a.shift()!);
  }
  return a;
}

/** 문장 끝 부호(마침표/물음표/느낌표 등). 마지막 토큰이 이걸로 끝나면 '마지막 단어'를 노출한다. */
const ENDING_PUNCT = /[。．.！!？?…]+$/u;

/**
 * 토큰 배열에서 문장 끝 부호를 분리한다.
 * - 마지막 토큰에 부호가 붙어 있으면(예: "水。") 부호만 떼어 `ending`으로, 토큰은 core에 남긴다("水").
 * - 부호만으로 된 토큰(예: 별도 "。")은 통째로 ending으로 옮긴다.
 * 끝 부호가 배열 타일에 섞이면 순서 힌트가 새므로, 표시·채점 모두 core만 쓰고 ending은 문장 끝에 고정한다.
 */
export function splitTrailingPunct(tokens: string[]): { core: string[]; ending: string } {
  const core = tokens.slice();
  let ending = "";
  while (core.length) {
    const last = core[core.length - 1]!;
    const m = last.match(ENDING_PUNCT);
    if (!m) break;
    ending = m[0] + ending;
    const stripped = last.slice(0, last.length - m[0].length);
    if (stripped) {
      core[core.length - 1] = stripped;
      break; // 텍스트 + 부호 토큰 → 부호만 떼고 종료
    }
    core.pop(); // 순수 부호 토큰 → 제거 후 계속(부호 토큰이 연속일 수 있음)
  }
  return { core, ending };
}

/** 배열 결과가 정답 문장과 같은지(연결 문자열 일치 — 동치 배열도 인정). */
export function checkSentence(submitted: string[], target: string[]): boolean {
  return submitted.join("") === target.join("");
}

/** 스캐폴딩 힌트: 앞에서 count개 정답 토큰. */
export function hintTokens(target: string[], count: number): string[] {
  return target.slice(0, Math.max(0, Math.min(count, target.length)));
}
