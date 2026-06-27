/**
 * AI 채점 구조화 출력 스키마 & 프롬프트 빌더 (PRD §5.3 step3, §5.4, §11)
 *
 * 네트워크 없이 단위 테스트 가능하도록 프롬프트 생성/응답 파싱을 순수 함수로 분리한다.
 * 실제 Claude 호출 wiring은 claudeProvider.ts.
 */

import * as z from "zod/v4";
import type {
  MeaningJudgeItem,
  MeaningVerdict,
  GrammarCheckItem,
  GrammarResult,
} from "../providers.js";

/** 의미 판정 응답 스키마 — structured output 최상위는 object여야 하므로 results로 래핑 */
export const MeaningResponseSchema = z.object({
  results: z.array(
    z.object({
      wordId: z.string(),
      verdict: z.enum(["accept", "reject", "partial"]),
      reason: z.string(),
    }),
  ),
});
export type MeaningResponse = z.infer<typeof MeaningResponseSchema>;

/** 문장 어법 검사 응답 스키마 */
export const GrammarResponseSchema = z.object({
  results: z.array(
    z.object({
      wordId: z.string(),
      errorCount: z.number().int(),
      issues: z.array(
        z.object({
          message: z.string(),
          span: z.string().optional(),
        }),
      ),
    }),
  ),
});
export type GrammarResponse = z.infer<typeof GrammarResponseSchema>;

export const MEANING_SYSTEM = [
  "당신은 한국 중·고등학생의 중국어 어휘 수행평가를 채점하는 보조 채점자입니다.",
  "각 단어에 대해 학생이 작성한 한국어 의미가 정답으로 인정 가능한지 판정하세요.",
  "판정 기준:",
  "- accept: 허용 정답과 의미가 본질적으로 같음(표현/어순 차이, 동의어 허용).",
  "- partial: 핵심 뜻은 통하지만 품사·뉘앙스·범위가 어긋나 완전한 정답으로 보기 어려움.",
  "- reject: 의미가 틀렸거나 무관함.",
  "관대하게: 맞춤법·띄어쓰기·조사 차이는 감점하지 마세요. 의미 자체만 보세요.",
  "반드시 입력의 모든 wordId에 대해 하나씩 판정을 반환하세요.",
].join("\n");

export const GRAMMAR_SYSTEM = [
  "당신은 한국 중·고등학생이 작성한 중국어 문장의 어법 오류를 세는 보조 채점자입니다.",
  "각 문장에서 어법(문법) 오류의 개수를 세고, 오류별로 간단한 사유를 한국어로 적으세요.",
  "오류로 셀 것: 어순 오류, 양사/조사 오용, 시제·부정 표현 오류, 빠진 필수 성분, 잘못된 단어 사용 등.",
  "오류로 세지 말 것: 단순 오탈자/간체-번체 혼용이 의미를 해치지 않는 경우, 문장부호.",
  "errorCount는 정수로, issues는 발견한 오류 목록(span은 문제 어구)으로 반환하세요.",
  "주어진 핵심 단어(hanzi)가 실제로 활용되었는지도 고려하되, 활용 여부만으로 과도하게 감점하지 마세요.",
  "반드시 입력의 모든 wordId에 대해 하나씩 결과를 반환하세요.",
].join("\n");

/** 의미 판정 user 메시지(배치 JSON) */
export function buildMeaningUserMessage(items: MeaningJudgeItem[]): string {
  const payload = items.map((it) => ({
    wordId: it.wordId,
    hanzi: it.hanzi,
    studentMeaning: it.studentMeaning,
    acceptableMeanings: it.acceptableMeanings,
  }));
  return [
    "다음 학생 답안들을 각각 판정하세요. JSON 배열로 입력합니다.",
    "```json",
    JSON.stringify(payload, null, 2),
    "```",
  ].join("\n");
}

/** 문장 어법 검사 user 메시지(배치 JSON) */
export function buildGrammarUserMessage(items: GrammarCheckItem[]): string {
  const payload = items.map((it) => ({
    wordId: it.wordId,
    hanzi: it.hanzi,
    studentSentence: it.studentSentence,
    ...(it.exampleSentence !== undefined
      ? { exampleSentence: it.exampleSentence }
      : {}),
  }));
  return [
    "다음 학생 문장들의 어법 오류를 각각 세세요. JSON 배열로 입력합니다.",
    "```json",
    JSON.stringify(payload, null, 2),
    "```",
  ].join("\n");
}

/** 응답(파싱된 객체) → 엔진 인터페이스 형태로 정규화 */
export function toMeaningVerdicts(resp: MeaningResponse): MeaningVerdict[] {
  return resp.results.map((r) => {
    const v: MeaningVerdict = { wordId: r.wordId, verdict: r.verdict };
    if (r.reason) v.reason = r.reason;
    return v;
  });
}

export function toGrammarResults(resp: GrammarResponse): GrammarResult[] {
  return resp.results.map((r) => ({
    wordId: r.wordId,
    errorCount: Math.max(0, Math.trunc(r.errorCount)),
    issues: r.issues.map((iss) => {
      const out: { message: string; span?: string } = { message: iss.message };
      if (iss.span !== undefined) out.span = iss.span;
      return out;
    }),
  }));
}
