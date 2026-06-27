"use server";

/**
 * 연습 모드 즉시 채점 + AI 피드백 (PRD §6.1 확장).
 *
 * 점수표(grades, 교사 확정 후 공개)를 거치지 않고 결과를 학생에게 바로 반환한다.
 * 정답키는 학생이 못 읽으므로(RLS) 서버(admin)에서 읽어 기존 채점 엔진(gradeSubmission)으로
 * 병음·성조(결정론) + 의미·문장(AI 코칭)을 채점한다. AI는 세트 작성 교사의 BYOK 키로 호출하며
 * ai-cache로 반복 연습 비용을 줄인다. 키가 없으면 결정론 채점만 수행한다.
 *
 * 정답 공개(reveal)는 교사 설정을 따르되, 시험용 세트는 응시 제출 전에는 공개하지 않는다
 * (시험 문제·정답 사전 노출 방지). 무제한 재시도. 기록은 practice_logs.
 */
import {
  createSupabaseServerClient,
  createSupabaseAdminClient,
} from "@/lib/supabase/server";
import { toGradingConfig, resolveAiProviderForTeacher } from "@/lib/grading-bridge";
import { gradeSubmission } from "@/grading/index.js";
import { resolveConfig } from "@/grading/scale.js";
import { normalizeMeaning } from "@/grading/meaningGrader.js";
import { toDisplayWord } from "@/grading/pinyin.js";
import type {
  StudentAnswer,
  WordKey as EngineWordKey,
  AreaResult,
  FinalScore,
} from "@/grading/index.js";
import type { Assessment, Word, WordKey } from "@/lib/database.types";

export interface PracticeAnswerInput {
  wordId: string;
  studentPinyin: string; // 성조 제외
  studentTones: number[];
  studentMeaning: string;
  /** 작문형=문장, 오류찾기형=수정문, 판단형="O"/"X" */
  studentSentence: string;
}

export interface PracticeIssue {
  syllableIndex?: number;
  kind: "initial" | "final" | "tone" | "meaning" | "grammar" | "missing" | "extra";
  expected?: string; // reveal=true일 때만 포함
  message: string;
}

export interface PracticeWordFeedback {
  wordId: string;
  hanzi: string;
  pinyinOk: boolean;
  toneOk: boolean;
  meaningOk: boolean;
  /** 문장 영역: null = AI 미적용(작문형, 자동 채점 불가) */
  sentenceOk: boolean | null;
  issues: PracticeIssue[];
  /** reveal=true일 때만 정답 노출 */
  correctDisplay?: string;
  acceptableMeanings?: string[];
}

export interface PracticeResult {
  reveal: boolean;
  aiUsed: boolean;
  pinyinScore: number;
  toneScore: number;
  meaningScore: number;
  sentenceScore: number;
  words: PracticeWordFeedback[];
}

export async function gradePracticeAttempt(
  assessmentId: string,
  answers: PracticeAnswerInput[],
): Promise<PracticeResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("로그인이 필요합니다");

  // RLS로 접근 가능한(공개+내 반) 평가만 조회됨
  const { data: assessment } = await supabase
    .from("assessments")
    .select("*")
    .eq("id", assessmentId)
    .single<Assessment>();
  if (!assessment) throw new Error("연습할 수 없는 평가입니다");
  if (!(assessment.mode === "practice" || assessment.allow_practice)) {
    throw new Error("연습이 허용되지 않은 평가입니다");
  }

  const config = resolveConfig(toGradingConfig(assessment));

  // 정답 공개 정책: 시험 세트는 응시 제출 후에만 공개(사전 노출 방지)
  let reveal = assessment.reveal_answers_in_practice;
  if (assessment.mode === "exam") {
    const { data: sub } = await supabase
      .from("submissions")
      .select("id")
      .eq("assessment_id", assessmentId)
      .eq("student_id", user.id)
      .neq("status", "in_progress")
      .limit(1)
      .maybeSingle();
    reveal = reveal && !!sub;
  }

  // 정답키는 서버(admin)에서만 읽는다
  const admin = createSupabaseAdminClient();
  const { data: words } = await admin
    .from("words")
    .select("*")
    .eq("assessment_id", assessmentId)
    .order("ord");
  const wordList = (words ?? []) as Word[];
  const { data: keys } = await admin
    .from("word_keys")
    .select("*")
    .in("word_id", wordList.map((w) => w.id));
  const keyByWord = new Map<string, WordKey>(
    ((keys ?? []) as WordKey[]).map((k) => [k.word_id, k]),
  );

  const engineKeys: EngineWordKey[] = wordList.map((w) => {
    const k = keyByWord.get(w.id);
    return {
      id: w.id,
      hanzi: w.hanzi,
      correctPinyin: k?.correct_pinyin ?? "",
      correctTones: k?.correct_tones ?? [],
      acceptableMeanings: k?.acceptable_meanings ?? [],
      ...(k?.example_sentence ? { exampleSentence: k.example_sentence } : {}),
      ...(w.error_prompt ? { errorPrompt: w.error_prompt } : {}),
      ...(k?.acceptable_corrections
        ? { acceptableCorrections: k.acceptable_corrections }
        : {}),
      ...(k?.is_grammatical != null ? { grammatical: k.is_grammatical } : {}),
      ...(k?.explanation ? { explanation: k.explanation } : {}),
    };
  });

  const ansByWord = new Map(answers.map((a) => [a.wordId, a]));
  const engineAnswers: StudentAnswer[] = wordList.map((w) => {
    const a = ansByWord.get(w.id);
    return {
      wordId: w.id,
      studentPinyin: a?.studentPinyin ?? "",
      studentTones: a?.studentTones ?? [],
      studentMeaning: a?.studentMeaning ?? "",
      studentSentence: a?.studentSentence ?? "",
    };
  });

  // 세트 작성 교사의 키로 의미·문장 AI 코칭(없으면 결정론만). 실패 시 AI 없이 재채점.
  const ai = await resolveAiProviderForTeacher(assessment.teacher_id);
  let result: FinalScore;
  let aiUsed = !!ai;
  try {
    result = await gradeSubmission({
      keys: engineKeys,
      answers: engineAnswers,
      config: toGradingConfig(assessment),
      ...(ai ? { ai } : {}),
    });
  } catch {
    aiUsed = false;
    result = await gradeSubmission({
      keys: engineKeys,
      answers: engineAnswers,
      config: toGradingConfig(assessment),
    });
  }

  const detailMap = (area: AreaResult) =>
    new Map(area.details.map((d) => [d.wordId, d]));
  const pinyinD = detailMap(result.pinyin);
  const toneD = detailMap(result.tone);
  const meaningD = detailMap(result.meaning);
  const sentenceD = detailMap(result.sentence);
  const isCompose = config.sentenceTaskType === "compose";

  const words_fb: PracticeWordFeedback[] = wordList.map((w) => {
    const k = keyByWord.get(w.id);
    const pd = pinyinD.get(w.id);
    const td = toneD.get(w.id);
    const md = meaningD.get(w.id);
    const sd = sentenceD.get(w.id);
    const a = ansByWord.get(w.id);

    const issues: PracticeIssue[] = [];
    const push = (kind: PracticeIssue["kind"], message: string, opts?: { syllableIndex?: number; expected?: string }) => {
      issues.push({
        ...(opts?.syllableIndex !== undefined ? { syllableIndex: opts.syllableIndex } : {}),
        kind,
        ...(reveal && opts?.expected !== undefined ? { expected: opts.expected } : {}),
        message: reveal ? message : maskMessage(kind),
      });
    };
    for (const iss of pd?.issues ?? []) {
      push(iss.kind as PracticeIssue["kind"], iss.message, {
        syllableIndex: iss.syllableIndex,
        expected: iss.expected,
      });
    }
    for (const iss of td?.issues ?? []) {
      push("tone", iss.message, { syllableIndex: iss.syllableIndex, expected: iss.expected });
    }

    // 의미: AI 있으면 엔진 판정(코칭 reason), 없으면 정답 목록 정확 일치
    let meaningOk: boolean;
    if (aiUsed) {
      meaningOk = (md?.errors ?? 0) === 0;
      for (const iss of md?.issues ?? []) push("meaning", iss.message);
    } else {
      const acceptable = new Set((k?.acceptable_meanings ?? []).map(normalizeMeaning));
      meaningOk = !!a?.studentMeaning && acceptable.has(normalizeMeaning(a.studentMeaning));
      if (!meaningOk) push("meaning", a?.studentMeaning ? "의미 오답" : "의미 미입력");
    }

    // 문장: 작문형은 AI 없으면 자동 채점 불가(null). 오류찾기형/판단형은 결정론.
    let sentenceOk: boolean | null;
    if (isCompose && !aiUsed) {
      sentenceOk = null;
    } else {
      sentenceOk = (sd?.errors ?? 0) === 0;
      for (const iss of sd?.issues ?? []) push("grammar", iss.message);
    }

    const fb: PracticeWordFeedback = {
      wordId: w.id,
      hanzi: w.hanzi,
      pinyinOk: (pd?.errors ?? 0) === 0,
      toneOk: (td?.errors ?? 0) === 0,
      meaningOk,
      sentenceOk,
      issues,
    };
    if (reveal && k) {
      fb.correctDisplay = toDisplayWord(k.correct_pinyin, k.correct_tones);
      fb.acceptableMeanings = k.acceptable_meanings;
    }
    return fb;
  });

  // 연습 기록(약점 분석용) — best-effort, 실패해도 무시
  try {
    const logRows = words_fb.map((fb) => ({
      student_id: user.id,
      word_id: fb.wordId,
      correct_by_area: {
        pinyin: fb.pinyinOk,
        tone: fb.toneOk,
        meaning: fb.meaningOk,
        sentence: fb.sentenceOk,
      },
    }));
    if (logRows.length) await supabase.from("practice_logs").insert(logRows);
  } catch {
    /* 무시 */
  }

  return {
    reveal,
    aiUsed,
    pinyinScore: result.pinyin.score,
    toneScore: result.tone.score,
    meaningScore: result.meaning.score,
    sentenceScore: result.sentence.score,
    words: words_fb,
  };
}

function maskMessage(kind: string): string {
  switch (kind) {
    case "initial":
      return "성모 오류";
    case "final":
      return "운모 오류";
    case "tone":
      return "성조 오류";
    case "missing":
      return "음절 누락";
    case "extra":
      return "여분 음절";
    case "meaning":
      return "의미 오류";
    case "grammar":
      return "문장 어법 오류";
    default:
      return "오류";
  }
}
