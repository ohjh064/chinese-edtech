/**
 * 오류 집계 (PRD §7 분석 화면 — 오류 히트맵, 약점 단어).
 * grades.details(영역별 AnswerDetail[])를 제출 전체에 걸쳐 단어×영역으로 합산한다.
 * 순수 함수 — 단위 테스트 가능.
 */

interface AreaDetail {
  wordId: string;
  errors: number;
}

export interface SubmissionDetails {
  pinyin?: AreaDetail[];
  tone?: AreaDetail[];
  meaning?: AreaDetail[];
  sentence?: AreaDetail[];
}

export interface WordErrorAgg {
  wordId: string;
  pinyin: number;
  tone: number;
  meaning: number;
  sentence: number;
  total: number;
  /** 이 단어에서 1개 이상 오류가 난 학생(제출) 수 */
  studentsWithError: number;
}

export interface ErrorAggregation {
  submissions: number;
  byWord: WordErrorAgg[];
  areaAvgErrors: {
    pinyin: number;
    tone: number;
    meaning: number;
    sentence: number;
  };
}

const AREAS = ["pinyin", "tone", "meaning", "sentence"] as const;
type Area = (typeof AREAS)[number];

// ───────── 연습 약점 추천 (PRD §6.1 약한 단어 자동 추출) ─────────

export interface PracticeLogRow {
  word_id: string;
  correct_by_area: { pinyin?: boolean; tone?: boolean; meaning?: boolean } | null;
}

export interface WeakWord {
  wordId: string;
  attempts: number;
  wrong: number; // 한 영역이라도 틀린 시도 수
  ratio: number;
}

export function aggregatePracticeWeakness(rows: PracticeLogRow[]): WeakWord[] {
  const map = new Map<string, { attempts: number; wrong: number }>();
  for (const r of rows) {
    const cur = map.get(r.word_id) ?? { attempts: 0, wrong: 0 };
    cur.attempts += 1;
    const c = r.correct_by_area;
    const anyWrong =
      !!c && (c.pinyin === false || c.tone === false || c.meaning === false);
    if (anyWrong) cur.wrong += 1;
    map.set(r.word_id, cur);
  }
  return [...map.entries()]
    .map(([wordId, v]) => ({
      wordId,
      attempts: v.attempts,
      wrong: v.wrong,
      ratio: v.attempts ? v.wrong / v.attempts : 0,
    }))
    .filter((w) => w.wrong > 0)
    .sort((a, b) => b.wrong - a.wrong || b.ratio - a.ratio || a.wordId.localeCompare(b.wordId));
}

export function aggregateErrors(
  detailsList: SubmissionDetails[],
): ErrorAggregation {
  const byWord = new Map<string, WordErrorAgg>();
  const areaTotals: Record<Area, number> = {
    pinyin: 0,
    tone: 0,
    meaning: 0,
    sentence: 0,
  };

  const ensure = (wordId: string): WordErrorAgg => {
    let w = byWord.get(wordId);
    if (!w) {
      w = {
        wordId,
        pinyin: 0,
        tone: 0,
        meaning: 0,
        sentence: 0,
        total: 0,
        studentsWithError: 0,
      };
      byWord.set(wordId, w);
    }
    return w;
  };

  for (const details of detailsList) {
    const wordsWithErrorThisSub = new Set<string>();
    for (const area of AREAS) {
      for (const d of details[area] ?? []) {
        const errs = d.errors ?? 0;
        if (errs <= 0) continue;
        const w = ensure(d.wordId);
        w[area] += errs;
        w.total += errs;
        areaTotals[area] += errs;
        wordsWithErrorThisSub.add(d.wordId);
      }
    }
    for (const wordId of wordsWithErrorThisSub) {
      ensure(wordId).studentsWithError += 1;
    }
  }

  const submissions = detailsList.length;
  const sorted = [...byWord.values()].sort(
    (a, b) => b.total - a.total || a.wordId.localeCompare(b.wordId),
  );

  const avg = (n: number) => (submissions ? n / submissions : 0);

  return {
    submissions,
    byWord: sorted,
    areaAvgErrors: {
      pinyin: avg(areaTotals.pinyin),
      tone: avg(areaTotals.tone),
      meaning: avg(areaTotals.meaning),
      sentence: avg(areaTotals.sentence),
    },
  };
}
