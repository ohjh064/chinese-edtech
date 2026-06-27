/**
 * 병음표기정확성 채점 (PRD §5.1) — 완전 자동, AI 호출 0.
 *
 * 오류 정의: 성모(initial)·운모(final) 표기 오류. 성조는 제외(§5.2에서 따로).
 * 카운트 단위(PRD §15-2):
 *   - initial_final: 성모/운모 각각 1개 (기본)
 *   - syllable:      음절당 1개(성모 또는 운모 중 하나라도 틀리면)
 *   - word:          단어당 1개(음절 중 하나라도 틀리면)
 */

import { parsePinyinWord } from "./pinyin.js";
import { mapErrorsToScore } from "./scale.js";
import type {
  AnswerDetail,
  AreaResult,
  GradingConfig,
  Issue,
  StudentAnswer,
  WordKey,
} from "./types.js";

export function gradePinyin(
  answers: StudentAnswer[],
  keys: WordKey[],
  config: GradingConfig,
): AreaResult {
  const keyById = new Map(keys.map((k) => [k.id, k]));
  const details: AnswerDetail[] = [];
  let errors = 0;

  for (const key of keys) {
    const answer = answers.find((a) => a.wordId === key.id);
    const expected = parsePinyinWord(key.correctPinyin, key.correctTones);
    const got = answer?.studentPinyin
      ? parsePinyinWord(answer.studentPinyin)
      : [];

    const issues: Issue[] = [];
    let initialFinalErrors = 0;
    let syllableErrorFlags = 0;

    const len = Math.max(expected.length, got.length);
    for (let i = 0; i < len; i++) {
      const exp = expected[i];
      const stu = got[i];
      let syllableHasError = false;

      if (!exp && stu) {
        // 학생이 음절을 더 적음
        initialFinalErrors += 2; // 성모+운모 둘 다로 간주
        syllableHasError = true;
        issues.push({
          syllableIndex: i,
          kind: "extra",
          got: stu.raw,
          message: `여분 음절 '${stu.raw}'`,
        });
      } else if (exp && !stu) {
        // 학생이 음절을 빠뜨림
        initialFinalErrors += 2;
        syllableHasError = true;
        issues.push({
          syllableIndex: i,
          kind: "missing",
          expected: `${exp.initial}${exp.final}`,
          message: `음절 누락 (정답 '${exp.initial}${exp.final}')`,
        });
      } else if (exp && stu) {
        if (exp.initial !== stu.initial) {
          initialFinalErrors += 1;
          syllableHasError = true;
          issues.push({
            syllableIndex: i,
            kind: "initial",
            expected: exp.initial || "(없음)",
            got: stu.initial || "(없음)",
            message: `성모 오류: '${stu.initial || "∅"}' → '${exp.initial || "∅"}'`,
          });
        }
        if (exp.final !== stu.final) {
          initialFinalErrors += 1;
          syllableHasError = true;
          issues.push({
            syllableIndex: i,
            kind: "final",
            expected: exp.final,
            got: stu.final,
            message: `운모 오류: '${stu.final}' → '${exp.final}'`,
          });
        }
      }

      if (syllableHasError) syllableErrorFlags += 1;
    }

    let wordErrors: number;
    switch (config.pinyinErrorUnit) {
      case "initial_final":
        wordErrors = initialFinalErrors;
        break;
      case "syllable":
        wordErrors = syllableErrorFlags;
        break;
      case "word":
        wordErrors = syllableErrorFlags > 0 ? 1 : 0;
        break;
    }

    errors += wordErrors;
    details.push({ wordId: key.id, errors: wordErrors, issues });
  }

  // keys에 없는 답안은 무시(정답키 기준 채점)
  void keyById;

  return {
    area: "pinyin",
    errors,
    score: mapErrorsToScore(errors),
    details,
  };
}
