/**
 * Claude API 기반 AI 채점 공급자 (PRD §9, §11)
 *
 * - 모델: claude-sonnet-4-6 (PRD §9에서 의미·문장 채점에 Sonnet을 명시).
 * - 비용 효율(§11): thinking 비활성 + effort low, 배치 1회 호출(judgeMeanings/checkGrammar 각각).
 * - 신뢰성: structured output(zod)으로 파싱.
 *
 * 엔진은 이 모듈에 의존하지 않는다(AiGradingProvider 인터페이스로 주입). 사용 예:
 *   import { createClaudeProvider } from "./ai/claudeProvider.js";
 *   const ai = createClaudeProvider();
 *   await gradeSubmission({ answers, keys, ai });
 */

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type {
  AiGradingProvider,
  GrammarCheckItem,
  GrammarResult,
  MeaningJudgeItem,
  MeaningVerdict,
} from "../providers.js";
import {
  GRAMMAR_SYSTEM,
  GrammarResponseSchema,
  MEANING_SYSTEM,
  MeaningResponseSchema,
  buildGrammarUserMessage,
  buildMeaningUserMessage,
  toGrammarResults,
  toMeaningVerdicts,
} from "./schemas.js";

/** PRD §9: 의미·문장 채점은 Sonnet */
export const DEFAULT_AI_MODEL = "claude-sonnet-4-6";

export interface ClaudeProviderOptions {
  /** 미지정 시 ANTHROPIC_API_KEY 환경변수 사용 */
  apiKey?: string;
  /** 기본 claude-sonnet-4-6 */
  model?: string;
  /** 고급: 직접 구성한 클라이언트 주입(테스트/플랫폼 클라이언트) */
  client?: Anthropic;
  maxTokens?: number;
}

export function createClaudeProvider(
  options: ClaudeProviderOptions = {},
): AiGradingProvider {
  const model = options.model ?? DEFAULT_AI_MODEL;
  const maxTokens = options.maxTokens ?? 8192;
  const client =
    options.client ??
    new Anthropic(options.apiKey ? { apiKey: options.apiKey } : {});

  return {
    async judgeMeanings(
      items: MeaningJudgeItem[],
    ): Promise<MeaningVerdict[]> {
      if (items.length === 0) return [];
      const res = await client.messages.parse({
        model,
        max_tokens: maxTokens,
        thinking: { type: "disabled" },
        output_config: {
          format: zodOutputFormat(MeaningResponseSchema),
          effort: "low",
        },
        system: MEANING_SYSTEM,
        messages: [{ role: "user", content: buildMeaningUserMessage(items) }],
      });
      if (!res.parsed_output) {
        throw new Error("의미 판정 응답 파싱 실패");
      }
      return toMeaningVerdicts(res.parsed_output);
    },

    async checkGrammar(
      items: GrammarCheckItem[],
    ): Promise<GrammarResult[]> {
      if (items.length === 0) return [];
      const res = await client.messages.parse({
        model,
        max_tokens: maxTokens,
        thinking: { type: "disabled" },
        output_config: {
          format: zodOutputFormat(GrammarResponseSchema),
          effort: "low",
        },
        system: GRAMMAR_SYSTEM,
        messages: [{ role: "user", content: buildGrammarUserMessage(items) }],
      });
      if (!res.parsed_output) {
        throw new Error("어법 검사 응답 파싱 실패");
      }
      return toGrammarResults(res.parsed_output);
    },
  };
}
