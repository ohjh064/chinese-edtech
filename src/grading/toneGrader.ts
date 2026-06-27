/**
 * 성조변별정확성 채점 (PRD §5.2) — 완전 자동, AI 호출 0.
 *
 * 오류 정의: 음절별 성조 1개 불일치 = 오류 1개.
 * 성조는 명시 배열(studentTones/correctTones)이 있으면 우선 사용하고,
 * 없으면 병음 문자열에서 추출한다(PRD §8 분리 저장 권장).
 */

import { parsePinyinWord } from "./pinyin.js";
import { mapErrorsToScore } from "./scale.js";
import type {
  AnswerDetail,
  AreaResult,
  Issue,
  StudentAnswer,
  WordKey,
} from "./types.js";

const toneLabel = (t: number | null): string =>
  t === null ? "(미입력)" : t === 0 ? "경성" : `${t}성`;

export function gradeTones(
  answers: StudentAnswer[],
  keys: WordKey[],
): AreaResult {
  const details: AnswerDetail[] = [];
  let errors = 0;

  for (const key of keys) {
    const answer = answers.find((a) => a.wordId === key.id);
    const expected = parsePinyinWord(key.correctPinyin, key.correctTones);
    const got =
      answer?.studentPinyin || answer?.studentTones
        ? parsePinyinWord(answer?.studentPinyin ?? "", answer?.studentTones)
        : [];

    const issues: Issue[] = [];
    let wordErrors = 0;
    const len = Math.max(expected.length, got.length);

    for (let i = 0; i < len; i++) {
      const exp = expected[i];
      const stu = got[i];
      if (!exp) continue; // 정답에 없는 여분 음절은 병음 영역에서만 카운트
      const expTone = exp.tone ?? null;
      const stuTone = stu?.tone ?? null;
      if (expTone !== stuTone) {
        wordErrors += 1;
        issues.push({
          syllableIndex: i,
          kind: "tone",
          expected: toneLabel(expTone),
          got: toneLabel(stuTone),
          message: `성조 오류: ${toneLabel(stuTone)} → ${toneLabel(expTone)}`,
        });
      }
    }

    errors += wordErrors;
    details.push({ wordId: key.id, errors: wordErrors, issues });
  }

  return {
    area: "tone",
    errors,
    score: mapErrorsToScore(errors),
    details,
  };
}
