/**
 * 오류판단정확성 채점 (PRD §5.4) — 과제 유형에 따라 분기.
 *
 *  - compose(작문형):  학생 작문 → AI 어법 검사(batch 1회) → 오류 카운트.
 *                      자동값은 "제안값", 교사 확정 필수(requiresTeacherConfirm).
 *  - find_error(오류 찾기형): 교사 정답(수정문) 대조 → 완전 자동.
 *  - judge(어법 판단형):  제시 문장이 어법에 맞는지 O/X 판단 → 정답 대조 → 완전 자동.
 */

import { mapErrorsToScore } from "./scale.js";
import { normalizeMeaning } from "./meaningGrader.js";
import type { AiGradingProvider, GrammarCheckItem } from "./providers.js";
import type {
  AnswerDetail,
  AreaResult,
  GradingConfig,
  Issue,
  StudentAnswer,
  WordKey,
} from "./types.js";

export interface SentenceGradeOptions {
  ai?: AiGradingProvider;
}

export async function gradeSentences(
  answers: StudentAnswer[],
  keys: WordKey[],
  config: GradingConfig,
  options: SentenceGradeOptions = {},
): Promise<AreaResult> {
  if (config.sentenceTaskType === "find_error") {
    return gradeFindError(answers, keys);
  }
  if (config.sentenceTaskType === "judge") {
    return gradeJudge(answers, keys);
  }
  return gradeCompose(answers, keys, options);
}

/** 어법 판단형 — 제시 문장의 어법 적합 여부(O/X)를 정답 대조, 완전 자동 (PRD §5.4 옵션) */
function gradeJudge(answers: StudentAnswer[], keys: WordKey[]): AreaResult {
  const details: AnswerDetail[] = [];
  let errors = 0;

  for (const key of keys) {
    const answer = answers.find((a) => a.wordId === key.id);
    const raw = (answer?.studentSentence ?? "").trim().toUpperCase();
    const answered = raw === "O" || raw === "X";
    const studentSaysOk = raw === "O";
    const correctOk = key.grammatical === true;
    const correct = answered && studentSaysOk === correctOk;
    const wordErrors = correct ? 0 : 1;
    errors += wordErrors;

    const correctLabel = correctOk ? "O(맞음)" : "X(안 맞음)";
    const explain = key.explanation ? ` · 해설: ${key.explanation}` : "";
    details.push({
      wordId: key.id,
      errors: wordErrors,
      issues: correct
        ? []
        : [
            {
              kind: "grammar",
              expected: correctLabel,
              got: answered ? `${raw}(${studentSaysOk ? "맞음" : "안 맞음"})` : "(미응답)",
              message: `정답 ${correctLabel}${explain}`,
            },
          ],
    });
  }

  return {
    area: "sentence",
    errors,
    score: mapErrorsToScore(errors),
    details,
  };
}

/** 오류 찾기형 — 정답(수정문) 대조, 완전 자동 (PRD §5.4 옵션) */
function gradeFindError(
  answers: StudentAnswer[],
  keys: WordKey[],
): AreaResult {
  const details: AnswerDetail[] = [];
  let errors = 0;

  for (const key of keys) {
    const answer = answers.find((a) => a.wordId === key.id);
    const raw = (answer?.studentSentence ?? "").trim();
    const accepted = new Set(
      (key.acceptableCorrections ?? []).map(normalizeMeaning),
    );
    const correct = raw !== "" && accepted.has(normalizeMeaning(raw));
    const wordErrors = correct ? 0 : 1;
    errors += wordErrors;
    details.push({
      wordId: key.id,
      errors: wordErrors,
      issues: correct
        ? []
        : [
            {
              kind: "grammar",
              got: raw || "(미작성)",
              message: "수정 오류 또는 미작성",
            },
          ],
    });
  }

  return {
    area: "sentence",
    errors,
    score: mapErrorsToScore(errors),
    details,
  };
}

/** 작문형 — AI 어법 검사(batch), 교사 확정 필수 (PRD §5.4) */
async function gradeCompose(
  answers: StudentAnswer[],
  keys: WordKey[],
  options: SentenceGradeOptions,
): Promise<AreaResult> {
  const items: GrammarCheckItem[] = [];
  for (const key of keys) {
    const answer = answers.find((a) => a.wordId === key.id);
    const sentence = (answer?.studentSentence ?? "").trim();
    if (sentence === "") continue; // 미작성은 아래에서 별도 처리
    const item: GrammarCheckItem = {
      wordId: key.id,
      hanzi: key.hanzi,
      studentSentence: sentence,
    };
    if (key.exampleSentence !== undefined) {
      item.exampleSentence = key.exampleSentence;
    }
    items.push(item);
  }

  const details: AnswerDetail[] = [];
  let errors = 0;

  // 미작성 문장 = 오류 1개 (자동)
  for (const key of keys) {
    const answer = answers.find((a) => a.wordId === key.id);
    if (!(answer?.studentSentence ?? "").trim()) {
      errors += 1;
      details.push({
        wordId: key.id,
        errors: 1,
        issues: [{ kind: "grammar", message: "문장 미작성" }],
      });
    }
  }

  if (items.length > 0 && options.ai) {
    const results = await options.ai.checkGrammar(items);
    const byId = new Map(results.map((r) => [r.wordId, r]));
    for (const item of items) {
      const r = byId.get(item.wordId);
      const wordErrors = r?.errorCount ?? 0;
      errors += wordErrors;
      const issues: Issue[] = (r?.issues ?? []).map((iss) => {
        const issue: Issue = { kind: "grammar", message: iss.message };
        if (iss.span !== undefined) issue.got = iss.span;
        return issue;
      });
      details.push({ wordId: item.wordId, errors: wordErrors, issues });
    }
  } else {
    // AI 미주입: 작성된 문장은 교사 검토로 위임(자동 오류 처리 안 함)
    for (const item of items) {
      details.push({
        wordId: item.wordId,
        errors: 0,
        issues: [{ kind: "grammar", message: "교사 검토 필요(AI 미적용)" }],
      });
    }
  }

  details.sort(
    (a, b) =>
      keys.findIndex((k) => k.id === a.wordId) -
      keys.findIndex((k) => k.id === b.wordId),
  );

  const writtenIds = new Set(items.map((i) => i.wordId));
  return {
    area: "sentence",
    errors,
    score: mapErrorsToScore(errors),
    details,
    aiSuggested: true,
    requiresTeacherConfirm: true,
    // 작성됐지만 AI 미적용인 항목 검토 필요
    needsReview: options.ai ? [] : [...writtenIds],
  };
}
