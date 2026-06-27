/**
 * 오류 개수 → 점수 척도 및 최종 점수 산출 (PRD §5.0, §5.5)
 */

import type {
  AttendanceStatus,
  AreaResult,
  FinalScore,
  GradingConfig,
  GradingConfigInput,
} from "./types.js";

/**
 * 오류 개수 → 점수 매핑 (PRD §5.0, 4개 영역 공통)
 *
 * | 오류 | 점수 |
 * | 0    | 25  |
 * | 1~2  | 20  |
 * | 3~4  | 15  |
 * | 5~6  | 10  |
 * | 7+   | 5   |
 *
 * 부분정답(0.5개)도 처리한다: 0초과 2이하 → 20.
 */
export function mapErrorsToScore(errorCount: number): number {
  if (errorCount <= 0) return 25;
  if (errorCount <= 2) return 20;
  if (errorCount <= 4) return 15;
  if (errorCount <= 6) return 10;
  return 5;
}

/** 참여자 최하점(기본점수) — PRD §1.3, §5.5 */
export const BASE_SCORE_ATTEMPTED = 20;
/** 장기 미인정 결석 등 추가평가 불가 미응시자 — PRD §1.3 (기본점수의 50%) */
export const BASE_SCORE_LONG_ABSENT = 10;

/**
 * 기본점수 하한 적용 (PRD §5.5)
 * - 응시자: max(total, 20)
 * - 장기 미인정 결석: 10
 * - 그 외 미응시: 0
 */
export function applyBaseScore(
  total: number,
  status: AttendanceStatus,
): number {
  switch (status) {
    case "attempted":
      return Math.max(total, BASE_SCORE_ATTEMPTED);
    case "long_absent":
      return BASE_SCORE_LONG_ABSENT;
    case "not_attempted":
      return 0;
  }
}

/** 4개 영역 결과를 합산해 최종 점수 구조로 만든다. PRD §5.5 */
export function combineFinalScore(
  areas: {
    pinyin: AreaResult;
    tone: AreaResult;
    meaning: AreaResult;
    sentence: AreaResult;
  },
  status: AttendanceStatus = "attempted",
): FinalScore {
  const total =
    areas.pinyin.score +
    areas.tone.score +
    areas.meaning.score +
    areas.sentence.score;
  const requiresTeacherConfirm = Object.values(areas).some(
    (a) => a.requiresTeacherConfirm,
  );
  return {
    ...areas,
    total,
    final: applyBaseScore(total, status),
    requiresTeacherConfirm,
  };
}

/** PRD §15 기본값. resolveConfig가 미지정 옵션을 이 값으로 채운다. */
export const DEFAULT_CONFIG: GradingConfig = {
  pinyinErrorUnit: "initial_final", // §15-2 권장값(a)
  sentenceTaskType: "compose", // §15-1 기본
  meaningPartialErrorWeight: 1, // §15-3 기본(부분정답도 1개)
};

export function resolveConfig(input?: GradingConfigInput): GradingConfig {
  return { ...DEFAULT_CONFIG, ...input };
}
