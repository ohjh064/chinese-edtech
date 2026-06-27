/**
 * AI 채점 공급자 인터페이스 (PRD §5.3 step3, §5.4, §11)
 *
 * 엔진은 AI 구현에 직접 의존하지 않는다. 결정론적 채점(병음·성조)은 AI 호출 0이며,
 * 의미/문장의 AI 단계만 이 인터페이스를 통해 주입한다.
 * 비용 효율(§11): 호출은 항상 batch(묶음)로 받도록 설계한다.
 */

/** 의미 판정 요청 1건 */
export interface MeaningJudgeItem {
  wordId: string;
  hanzi: string;
  studentMeaning: string;
  acceptableMeanings: string[];
}

/** 의미 판정 결과 */
export interface MeaningVerdict {
  wordId: string;
  /** accept=정답 인정, reject=오류, partial=부분정답(가중치 적용) */
  verdict: "accept" | "reject" | "partial";
  reason?: string;
}

/** 문장 어법 검사 요청 1건 */
export interface GrammarCheckItem {
  wordId: string;
  hanzi: string;
  studentSentence: string;
  exampleSentence?: string;
}

/** 문장 어법 검사 결과 */
export interface GrammarResult {
  wordId: string;
  errorCount: number;
  issues: { message: string; span?: string }[];
}

/** AI 공급자. 미주입 시 의미 fallback/문장 작문형은 교사 검토로 위임된다. */
export interface AiGradingProvider {
  /** §5.3 step3: 애매한 의미 답안을 묶어서 한 번에 판정 */
  judgeMeanings(items: MeaningJudgeItem[]): Promise<MeaningVerdict[]>;
  /** §5.4: 학생 전체 문장을 한 번에 어법 검사 */
  checkGrammar(items: GrammarCheckItem[]): Promise<GrammarResult[]>;
}
