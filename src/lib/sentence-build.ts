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

/** 배열 결과가 정답 문장과 같은지(연결 문자열 일치 — 동치 배열도 인정). */
export function checkSentence(submitted: string[], target: string[]): boolean {
  return submitted.join("") === target.join("");
}

/** 스캐폴딩 힌트: 앞에서 count개 정답 토큰. */
export function hintTokens(target: string[], count: number): string[] {
  return target.slice(0, Math.max(0, Math.min(count, target.length)));
}
