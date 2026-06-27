/**
 * 의미변별정확성 채점 (PRD §5.3) — AI + 교사 보조.
 *
 * 3단계(비용 효율 순서, PRD §11):
 *  1) 정확 일치/정규화 매칭(비용 0)
 *  2) 동의어 테이블 매칭(비용 0)
 *  3) AI 판정(fallback, batch 1회) — 공급자 미주입 시 needsReview로 위임
 *
 * 부분정답 가중치(§15-3): AI verdict가 'partial'이면 config.meaningPartialErrorWeight 적용.
 */

import { mapErrorsToScore } from "./scale.js";
import type { AiGradingProvider, MeaningJudgeItem } from "./providers.js";
import type {
  AnswerDetail,
  AreaResult,
  GradingConfig,
  Issue,
  StudentAnswer,
  WordKey,
} from "./types.js";

/** 비교용 정규화: 소문자, 공백/문장부호 제거, 괄호주석 제거. */
export function normalizeMeaning(s: string): string {
  return s
    .toLowerCase()
    .replace(/\([^)]*\)/g, "") // (전화) 같은 주석 제거
    .replace(/[\s.,!?;:~·…"'`「」『』]/g, "")
    .trim();
}

export interface MeaningGradeOptions {
  /** 선택: 동의어 테이블. key/value 모두 정규화 전 원문 허용. */
  synonyms?: Record<string, string[]>;
  /** 선택: AI 공급자(fallback) */
  ai?: AiGradingProvider;
}

function buildSynonymSet(
  acceptable: string[],
  synonyms?: Record<string, string[]>,
): Set<string> {
  const set = new Set(acceptable.map(normalizeMeaning));
  if (synonyms) {
    for (const accepted of acceptable) {
      const extra = synonyms[accepted] ?? synonyms[normalizeMeaning(accepted)];
      if (extra) for (const syn of extra) set.add(normalizeMeaning(syn));
    }
  }
  return set;
}

export async function gradeMeaning(
  answers: StudentAnswer[],
  keys: WordKey[],
  config: GradingConfig,
  options: MeaningGradeOptions = {},
): Promise<AreaResult> {
  const details: AnswerDetail[] = [];
  const needsReview: string[] = [];
  const uncertain: MeaningJudgeItem[] = [];
  let errors = 0;

  // 1~2단계: 규칙 기반 매칭
  for (const key of keys) {
    const answer = answers.find((a) => a.wordId === key.id);
    const raw = (answer?.studentMeaning ?? "").trim();

    if (!raw) {
      // 미작성 = 오류 1개
      errors += 1;
      details.push({
        wordId: key.id,
        errors: 1,
        issues: [{ kind: "meaning", message: "의미 미작성" }],
      });
      continue;
    }

    const accepted = buildSynonymSet(key.acceptableMeanings, options.synonyms);
    if (accepted.has(normalizeMeaning(raw))) {
      details.push({ wordId: key.id, errors: 0, issues: [] });
      continue;
    }

    // 3단계 후보
    uncertain.push({
      wordId: key.id,
      hanzi: key.hanzi,
      studentMeaning: raw,
      acceptableMeanings: key.acceptableMeanings,
    });
  }

  // 3단계: AI 판정(있으면) — batch 1회
  if (uncertain.length > 0 && options.ai) {
    const verdicts = await options.ai.judgeMeanings(uncertain);
    const byId = new Map(verdicts.map((v) => [v.wordId, v]));
    for (const item of uncertain) {
      const v = byId.get(item.wordId);
      let wordErrors = 0;
      const issues: Issue[] = [];
      if (!v || v.verdict === "reject") {
        wordErrors = 1;
        issues.push({
          kind: "meaning",
          got: item.studentMeaning,
          message: v?.reason ?? "의미 오류(AI 판정)",
        });
      } else if (v.verdict === "partial") {
        wordErrors = config.meaningPartialErrorWeight;
        issues.push({
          kind: "meaning",
          got: item.studentMeaning,
          message: v.reason ?? "부분정답",
        });
      }
      errors += wordErrors;
      details.push({ wordId: item.wordId, errors: wordErrors, issues });
    }
  } else {
    // AI 미주입: 규칙으로 못 거른 답안은 교사 검토로 위임(자동 오류 처리 안 함)
    for (const item of uncertain) {
      needsReview.push(item.wordId);
      details.push({
        wordId: item.wordId,
        errors: 0,
        issues: [
          {
            kind: "meaning",
            got: item.studentMeaning,
            message: "자동 매칭 실패 — 교사 검토 필요",
          },
        ],
      });
    }
  }

  // wordId 순서를 keys 기준으로 정렬(상세 일관성)
  details.sort(
    (a, b) =>
      keys.findIndex((k) => k.id === a.wordId) -
      keys.findIndex((k) => k.id === b.wordId),
  );

  const result: AreaResult = {
    area: "meaning",
    errors,
    score: mapErrorsToScore(errors),
    details,
  };
  if (needsReview.length > 0) {
    result.needsReview = needsReview;
    result.requiresTeacherConfirm = true;
  }
  return result;
}
