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

// ───────── 단어장 학습 추적 집계 (교사용, study_logs) ─────────

export interface StudyLogRow {
  word_id: string;
  step: number; // 1..5
  correct: boolean | null; // null = 1단계(듣기)
  attempt_at?: string; // 학습 시각(ISO). 있으면 날짜 집계에 사용
}

export interface StudyStepStat {
  step: number;
  attempted: number; // 이 단계에서 학습한(등장한) 고유 단어 수
  correct: number; // 정답 단어 수(1단계는 0)
  wrong: number; // 오답 단어 수
  wrongWordIds: string[]; // 오답 단어 id
  lastAt: string | null; // 이 단계 마지막 학습 시각(ISO)
}

export interface StudySummary {
  learnedWordIds: string[]; // 전 단계에서 한 번이라도 학습한 고유 단어
  wrongWordIds: string[]; // 한 번이라도 틀린 고유 단어
  byStep: StudyStepStat[]; // 단계 오름차순
  firstAt: string | null; // 최초 학습 시각(ISO)
  lastAt: string | null; // 최근 학습 시각(ISO)
  dates: string[]; // 학습한 날짜(YYYY-MM-DD, UTC 기준) 오름차순 — 며칠에 걸쳐 했는지
}

/** ISO(UTC) 문자열은 사전식 비교로 시간 순 정렬이 성립. null 안전 min/max. */
function minIso(a: string | null, b: string): string {
  return a === null || b < a ? b : a;
}
function maxIso(a: string | null, b: string): string {
  return a === null || b > a ? b : a;
}

/**
 * study_logs 행들을 학습 요약으로 집계(한 학생 또는 한 세트 범위의 rows 입력).
 * (word, step)별로 한 번이라도 correct===false면 그 단계에서 오답 처리.
 * attempt_at이 있으면 세트 최초/최근 학습 시각·학습 날짜 목록·단계별 마지막 시각을 함께 낸다.
 */
export function summarizeStudyLogs(rows: StudyLogRow[]): StudySummary {
  const stepWords = new Map<number, Map<string, { wrong: boolean }>>();
  const stepLast = new Map<number, string | null>();
  const learned = new Set<string>();
  const wrongAll = new Set<string>();
  const dateSet = new Set<string>();
  let firstAt: string | null = null;
  let lastAt: string | null = null;
  for (const r of rows) {
    learned.add(r.word_id);
    if (r.correct === false) wrongAll.add(r.word_id);
    let m = stepWords.get(r.step);
    if (!m) {
      m = new Map();
      stepWords.set(r.step, m);
    }
    const w = m.get(r.word_id) ?? { wrong: false };
    if (r.correct === false) w.wrong = true;
    m.set(r.word_id, w);

    if (r.attempt_at) {
      firstAt = minIso(firstAt, r.attempt_at);
      lastAt = maxIso(lastAt, r.attempt_at);
      stepLast.set(r.step, maxIso(stepLast.get(r.step) ?? null, r.attempt_at));
      dateSet.add(r.attempt_at.slice(0, 10)); // YYYY-MM-DD
    }
  }
  const byStep: StudyStepStat[] = [...stepWords.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([step, m]) => {
      const wrongWordIds = [...m.entries()].filter(([, w]) => w.wrong).map(([id]) => id);
      const attempted = m.size;
      const wrong = wrongWordIds.length;
      const correct = step === 1 ? 0 : attempted - wrong;
      return { step, attempted, correct, wrong, wrongWordIds, lastAt: stepLast.get(step) ?? null };
    });
  return {
    learnedWordIds: [...learned],
    wrongWordIds: [...wrongAll],
    byStep,
    firstAt,
    lastAt,
    dates: [...dateSet].sort(),
  };
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
