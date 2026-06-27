/**
 * 채점 엔진 진입점 (PRD §5)
 *
 * gradeSubmission: 한 학생 제출물을 4개 영역으로 채점하고 최종 점수를 산출한다.
 * 결정론적 영역(병음·성조)은 항상 즉시 채점, 의미·문장은 공급자/설정에 따른다.
 */

import { gradePinyin } from "./pinyinGrader.js";
import { gradeTones } from "./toneGrader.js";
import { gradeMeaning, type MeaningGradeOptions } from "./meaningGrader.js";
import {
  gradeSentences,
  type SentenceGradeOptions,
} from "./sentenceGrader.js";
import { combineFinalScore, resolveConfig } from "./scale.js";
import type {
  AttendanceStatus,
  FinalScore,
  GradingConfigInput,
  StudentAnswer,
  WordKey,
} from "./types.js";
import type { AiGradingProvider } from "./providers.js";

export interface GradeSubmissionInput {
  answers: StudentAnswer[];
  keys: WordKey[];
  config?: GradingConfigInput;
  status?: AttendanceStatus;
  ai?: AiGradingProvider;
  /** 의미 동의어 테이블(선택) */
  synonyms?: Record<string, string[]>;
}

export async function gradeSubmission(
  input: GradeSubmissionInput,
): Promise<FinalScore> {
  const config = resolveConfig(input.config);
  const { answers, keys } = input;

  const meaningOpts: MeaningGradeOptions = {};
  if (input.ai) meaningOpts.ai = input.ai;
  if (input.synonyms) meaningOpts.synonyms = input.synonyms;

  const sentenceOpts: SentenceGradeOptions = {};
  if (input.ai) sentenceOpts.ai = input.ai;

  const pinyin = gradePinyin(answers, keys, config);
  const tone = gradeTones(answers, keys);
  const [meaning, sentence] = await Promise.all([
    gradeMeaning(answers, keys, config, meaningOpts),
    gradeSentences(answers, keys, config, sentenceOpts),
  ]);

  return combineFinalScore(
    { pinyin, tone, meaning, sentence },
    input.status ?? "attempted",
  );
}

export * from "./types.js";
export * from "./providers.js";
export {
  mapErrorsToScore,
  applyBaseScore,
  combineFinalScore,
  resolveConfig,
  DEFAULT_CONFIG,
} from "./scale.js";
export {
  parsePinyinWord,
  normalizeSyllable,
  splitInitialFinal,
  splitSyllables,
  applyToneMark,
  toDisplaySyllable,
  toDisplayWord,
} from "./pinyin.js";
export { gradePinyin } from "./pinyinGrader.js";
export { gradeTones } from "./toneGrader.js";
export { gradeMeaning, normalizeMeaning } from "./meaningGrader.js";
export { gradeSentences } from "./sentenceGrader.js";
