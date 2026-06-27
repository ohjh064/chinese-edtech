/**
 * 채점 엔진 공용 타입 (PRD §5, §10, §15)
 *
 * 데이터 모델은 PRD §10을 따르되, 채점에 필요한 최소 형태로 정리한다.
 * 모든 "열린 결정사항"(PRD §15)은 GradingConfig 옵션으로 노출하며,
 * 각 옵션의 기본값은 PRD의 권장값을 따른다.
 */

/** 점수 영역(평가 요소) — PRD §1.3 */
export type GradingArea = "pinyin" | "tone" | "meaning" | "sentence";

/** 병음 오류 카운트 단위 — PRD §5.1 설정값, §15-2 */
export type PinyinErrorUnit =
  | "initial_final" // (a) 성모/운모 각각 1개 — 기본값(권장)
  | "syllable" // (b) 음절당 1개
  | "word"; // (c) 단어당 1개

/** 문장(오류판단) 과제 유형 — PRD §5.4, §15-1 */
export type SentenceTaskType =
  | "compose" // 작문형: 단어 활용 작문 → 어법 오류 카운트(AI) — 기본값
  | "find_error"; // 오류 찾기형: 오류 문장 제시 → 학생 수정 → 정답 대조(완전 자동)

/**
 * 채점 설정. PRD §15의 "사용자가 선택할 수 있게" 항목을 모두 옵션화한다.
 * 기본값은 resolveConfig()에서 채운다.
 */
export interface GradingConfig {
  /** §15-2: 병음 오류 카운트 단위. 기본 'initial_final'. */
  pinyinErrorUnit: PinyinErrorUnit;
  /** §15-1: 문장 과제 유형. 기본 'compose'. */
  sentenceTaskType: SentenceTaskType;
  /**
   * §15-3: 의미 부분정답 가중치. 1=틀리면 무조건 1개, 0.5=부분정답은 0.5개.
   * 부분정답 판정은 AI verdict가 'partial'일 때만 적용된다(규칙 기반으로는 판정 불가).
   */
  meaningPartialErrorWeight: 1 | 0.5;
}

export type GradingConfigInput = Partial<GradingConfig>;

/** 정답키 단어 — PRD §10 words */
export interface WordKey {
  /** 단어 식별자(문항 순서/id). */
  id: string;
  hanzi: string;
  /** 음절 공백 분리 권장. 예: "ni hao". 성조부호/숫자 포함 허용. */
  correctPinyin: string;
  /** 음절별 정답 성조(1·2·3·4, 경성=0). 미지정 시 correctPinyin에서 추출 시도. */
  correctTones?: number[];
  /** 의미 허용 정답 목록. 예: ["안녕", "안녕하세요"]. */
  acceptableMeanings: string[];
  /** 작문형 예문(참고). */
  exampleSentence?: string;
  /** 오류 찾기형: 학생에게 제시할 오류 포함 문장. */
  errorPrompt?: string;
  /** 오류 찾기형: 정답(수정된 문장) 허용 목록. */
  acceptableCorrections?: string[];
}

/** 학생 답안 — PRD §10 answers */
export interface StudentAnswer {
  /** 대응하는 WordKey.id */
  wordId: string;
  /** 로마자 병음. 성조부호/숫자 포함 허용(분리 저장 권장 — PRD §8). 미입력 허용. */
  studentPinyin?: string;
  /** 음절별 입력 성조. 미지정 시 studentPinyin에서 추출 시도. */
  studentTones?: number[];
  studentMeaning?: string;
  studentSentence?: string;
}

/** 한 영역의 채점 결과(공통) */
export interface AreaResult {
  area: GradingArea;
  errors: number;
  score: number;
  /** 항목별 상세(피드백/하이라이트용) */
  details: AnswerDetail[];
  /** 자동값이 제안값인지(교사 확정 필요). PRD §5.4. */
  aiSuggested?: boolean;
  requiresTeacherConfirm?: boolean;
  /** 규칙으로 확정 못해 검토가 필요한 wordId 목록. */
  needsReview?: string[];
}

/** 단어 1개에 대한 영역별 상세 */
export interface AnswerDetail {
  wordId: string;
  errors: number;
  /** 오류 위치/사유(피드백·하이라이트) */
  issues: Issue[];
}

export interface Issue {
  /** 음절 인덱스(병음/성조), 의미/문장은 0 */
  syllableIndex?: number;
  kind:
    | "initial"
    | "final"
    | "tone"
    | "meaning"
    | "grammar"
    | "missing"
    | "extra";
  expected?: string;
  got?: string;
  message: string;
}

/** 출석/응시 상태 — 기본점수 하한 적용용. PRD §5.5 */
export type AttendanceStatus =
  | "attempted" // 응시 완료 → 하한 20
  | "long_absent" // 장기 미인정 결석(추가평가 불가) → 10
  | "not_attempted"; // 그 외 미응시 → 0 (정책상 별도)

export interface FinalScore {
  pinyin: AreaResult;
  tone: AreaResult;
  meaning: AreaResult;
  sentence: AreaResult;
  /** 4영역 합(최대 100, 하한 적용 전) */
  total: number;
  /** 기본점수 하한 적용 후 최종 점수 */
  final: number;
  /** 교사 확정이 필요한 영역이 하나라도 있으면 true */
  requiresTeacherConfirm: boolean;
}
