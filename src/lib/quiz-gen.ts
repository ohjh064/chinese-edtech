/**
 * 영역별 퀴즈 4지선다 문제 생성기 (순수 함수 — 네트워크/DB 없음, 테스트 가능).
 *
 * 정답키(word_keys)로부터 영역별 보기·정답을 만든다. 셔플은 시드 기반이라 결정론적.
 * 채점 표시(toDisplayWord 등)는 채점 엔진의 순수 헬퍼를 재사용한다.
 */
import { toDisplayWord, normalizeSyllable, splitInitialFinal, INITIALS } from "@/grading/pinyin.js";
import { normalizeMeaning } from "@/grading/meaningGrader.js";
import type { SentenceTaskTypeDb } from "@/lib/database.types";

export type QuizMode = "pinyin" | "tone" | "meaning" | "sentence";
export type QuizDirection = "forward" | "reverse";

export interface QuizItem {
  wordId: string;
  hanzi: string;
  pinyin: string; // 무성조, 공백 구분
  tones: number[];
  meanings: string[];
  exampleSentence?: string;
  errorPrompt?: string;
  acceptableCorrections?: string[];
  grammatical?: boolean;
  explanation?: string;
}

export interface QuizQuestion {
  wordId: string;
  hanzi: string; // 발음 듣기(TTS)용 — 문제의 대상 단어
  prompt: string;
  promptHint?: string;
  options: string[];
  correctIndex: number;
  explain?: string;
}

// ── 시드 기반 셔플(결정론) ──
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}

function makeOptions(
  correct: string,
  distractors: string[],
  rng: () => number,
): { options: string[]; correctIndex: number } {
  const opts = shuffle([correct, ...distractors], rng);
  return { options: opts, correctIndex: opts.indexOf(correct) };
}

/** correct(정규화)와 다른 보기 후보에서 최대 n개 고유 추출 */
function pickDistinct(
  correctNorm: string,
  candidates: { display: string; norm: string }[],
  n: number,
  rng: () => number,
): string[] {
  const seen = new Set([correctNorm]);
  const out: string[] = [];
  for (const c of shuffle(candidates, rng)) {
    if (!c.display.trim() || seen.has(c.norm)) continue;
    seen.add(c.norm);
    out.push(c.display);
    if (out.length >= n) break;
  }
  return out;
}

const normHanzi = (s: string) => s.trim();
const normPinyin = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** 무성조 병음 정규화 표시(소문자, 음절 공백) */
function plainPinyin(pinyin: string): string {
  return pinyin
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((tok) => normalizeSyllable(tok).plain)
    .join(" ");
}

/** 한 음절의 성모를 다른 성모로 바꾼 오답 병음 */
function perturbPinyin(pinyin: string, rng: () => number): string | null {
  const syls = pinyin.trim().split(/\s+/).filter(Boolean);
  if (!syls.length) return null;
  const i = Math.floor(rng() * syls.length);
  const { initial, final } = splitInitialFinal(normalizeSyllable(syls[i]!).plain);
  const cands = INITIALS.filter((x) => x !== initial && final.length > 0);
  if (!cands.length) return null;
  const ni = cands[Math.floor(rng() * cands.length)]!;
  const copy = syls.slice();
  copy[i] = ni + final;
  const out = copy.join(" ");
  return out === pinyin ? null : out;
}

/** 한 음절의 성조를 다른 성조(1~4)로 바꾼 패턴 */
function perturbTones(tones: number[], rng: () => number): number[] | null {
  const idxs = tones.map((t, i) => ({ t, i })).filter((x) => x.t >= 1 && x.t <= 4);
  if (!idxs.length) return null;
  const pick = idxs[Math.floor(rng() * idxs.length)]!;
  const others = [1, 2, 3, 4].filter((t) => t !== pick.t);
  const nt = others[Math.floor(rng() * others.length)]!;
  const copy = tones.slice();
  copy[pick.i] = nt;
  return copy;
}

export interface BuildOptions {
  mode: QuizMode;
  direction?: QuizDirection;
  sentenceTaskType?: SentenceTaskTypeDb;
  seed?: number;
}

/** items로부터 영역별 4지선다 문제 풀 생성(각 단어 1문항, 적격 단어만). */
export function buildQuestions(items: QuizItem[], opts: BuildOptions): QuizQuestion[] {
  const rng = mulberry32(opts.seed ?? 1);
  const direction = opts.direction ?? "forward";
  const out: QuizQuestion[] = [];

  for (const it of items) {
    const q = buildOne(it, items, opts.mode, direction, opts.sentenceTaskType, rng);
    if (q) out.push({ ...q, hanzi: it.hanzi });
  }
  return shuffle(out, rng);
}

function buildOne(
  it: QuizItem,
  all: QuizItem[],
  mode: QuizMode,
  direction: QuizDirection,
  sentenceTaskType: SentenceTaskTypeDb | undefined,
  rng: () => number,
): Omit<QuizQuestion, "hanzi"> | null {
  if (mode === "meaning") {
    const meaning = (it.meanings ?? []).find((m) => m.trim());
    if (!meaning || !it.hanzi) return null;
    if (direction === "reverse") {
      // 뜻 → 단어
      const distractors = pickDistinct(
        normHanzi(it.hanzi),
        all.filter((x) => x.wordId !== it.wordId).map((x) => ({ display: x.hanzi, norm: normHanzi(x.hanzi) })),
        3,
        rng,
      );
      const { options, correctIndex } = makeOptions(it.hanzi, distractors, rng);
      return { wordId: it.wordId, prompt: meaning, options, correctIndex, explain: `${it.hanzi} · ${it.meanings.join(", ")}` };
    }
    // 단어 → 뜻
    const distractors = pickDistinct(
      normalizeMeaning(meaning),
      all
        .filter((x) => x.wordId !== it.wordId)
        .flatMap((x) => (x.meanings ?? []).filter((m) => m.trim()).slice(0, 1))
        .map((m) => ({ display: m, norm: normalizeMeaning(m) })),
      3,
      rng,
    );
    const { options, correctIndex } = makeOptions(meaning, distractors, rng);
    return { wordId: it.wordId, prompt: it.hanzi, options, correctIndex, explain: it.meanings.join(", ") };
  }

  if (mode === "pinyin") {
    const correct = plainPinyin(it.pinyin);
    if (!correct || !it.hanzi) return null;
    if (direction === "reverse") {
      // 병음 → 한자
      const distractors = pickDistinct(
        normHanzi(it.hanzi),
        all.filter((x) => x.wordId !== it.wordId).map((x) => ({ display: x.hanzi, norm: normHanzi(x.hanzi) })),
        3,
        rng,
      );
      const { options, correctIndex } = makeOptions(it.hanzi, distractors, rng);
      return { wordId: it.wordId, prompt: toDisplayWord(it.pinyin, it.tones), options, correctIndex, explain: it.hanzi };
    }
    // 한자 → 병음(무성조)
    let distractors = pickDistinct(
      normPinyin(correct),
      all
        .filter((x) => x.wordId !== it.wordId && x.pinyin.trim())
        .map((x) => ({ display: plainPinyin(x.pinyin), norm: normPinyin(plainPinyin(x.pinyin)) })),
      3,
      rng,
    );
    // 부족하면 성모 치환 오답으로 보충
    let guard = 0;
    while (distractors.length < 3 && guard++ < 12) {
      const p = perturbPinyin(correct, rng);
      if (p && normPinyin(p) !== normPinyin(correct) && !distractors.some((d) => normPinyin(d) === normPinyin(p))) {
        distractors.push(p);
      }
    }
    const { options, correctIndex } = makeOptions(correct, distractors, rng);
    return { wordId: it.wordId, prompt: it.hanzi, options, correctIndex, explain: toDisplayWord(it.pinyin, it.tones) };
  }

  if (mode === "tone") {
    if (!it.pinyin.trim() || !it.tones.length) return null;
    const correct = toDisplayWord(it.pinyin, it.tones);
    const distractors: string[] = [];
    let guard = 0;
    while (distractors.length < 3 && guard++ < 20) {
      const pt = perturbTones(it.tones, rng);
      if (!pt) break;
      const disp = toDisplayWord(it.pinyin, pt);
      if (disp !== correct && !distractors.includes(disp)) distractors.push(disp);
    }
    if (!distractors.length) return null;
    const { options, correctIndex } = makeOptions(correct, distractors, rng);
    return {
      wordId: it.wordId,
      prompt: it.hanzi,
      promptHint: plainPinyin(it.pinyin),
      options,
      correctIndex,
      explain: correct,
    };
  }

  // sentence
  if (sentenceTaskType === "judge") {
    if (!it.errorPrompt || it.grammatical === undefined) return null;
    const options = ["O (어법에 맞음)", "X (어법에 안 맞음)"];
    const correctIndex = it.grammatical ? 0 : 1;
    return {
      wordId: it.wordId,
      prompt: it.errorPrompt,
      options,
      correctIndex,
      explain: it.explanation || (it.grammatical ? "어법에 맞는 문장입니다." : "어법에 맞지 않는 문장입니다."),
    };
  }
  if (sentenceTaskType === "find_error") {
    const correct = (it.acceptableCorrections ?? []).find((c) => c.trim());
    if (!it.errorPrompt || !correct) return null;
    const distractors: string[] = [];
    // 오류문장 자체(미수정)를 오답으로
    if (normPinyin(it.errorPrompt) !== normalizeMeaning(correct)) distractors.push(it.errorPrompt);
    // 타 단어 정답/예문으로 보충
    for (const d of pickDistinct(
      normalizeMeaning(correct),
      all
        .filter((x) => x.wordId !== it.wordId)
        .flatMap((x) => [...(x.acceptableCorrections ?? []), x.exampleSentence ?? ""].filter((s) => s.trim()))
        .map((s) => ({ display: s, norm: normalizeMeaning(s) })),
      3,
      rng,
    )) {
      if (distractors.length >= 3) break;
      if (!distractors.includes(d)) distractors.push(d);
    }
    const { options, correctIndex } = makeOptions(correct, distractors.slice(0, 3), rng);
    return { wordId: it.wordId, prompt: `오류 문장을 바르게 고친 것은?\n"${it.errorPrompt}"`, options, correctIndex };
  }
  // compose → 빈칸(cloze)
  const ex = it.exampleSentence;
  if (!ex || !it.hanzi || !ex.includes(it.hanzi)) return null;
  const blanked = ex.replace(it.hanzi, "____");
  const distractors = pickDistinct(
    normHanzi(it.hanzi),
    all.filter((x) => x.wordId !== it.wordId).map((x) => ({ display: x.hanzi, norm: normHanzi(x.hanzi) })),
    3,
    rng,
  );
  const { options, correctIndex } = makeOptions(it.hanzi, distractors, rng);
  return { wordId: it.wordId, prompt: `빈칸에 알맞은 단어는?\n"${blanked}"`, options, correctIndex, explain: ex };
}
