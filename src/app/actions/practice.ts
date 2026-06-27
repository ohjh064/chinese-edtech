"use server";

/**
 * 연습 모드 즉시 채점 (PRD §6.1) — 병음·성조 결정론 채점, AI 비용 0.
 *
 * 점수표(grades, 교사 확정 후 공개)를 거치지 않고 결과를 학생에게 바로 반환한다.
 * 정답키는 학생이 못 읽으므로(RLS) 서버(admin)에서 읽어 채점하며,
 * 정답 공개(expected/정답표시)는 교사 설정(reveal_answers_in_practice)을 따른다.
 * 무제한 재시도. 연습 기록은 practice_logs에 남겨 추후 약점 분석에 사용.
 */
import {
  createSupabaseServerClient,
  createSupabaseAdminClient,
} from "@/lib/supabase/server";
import { toGradingConfig } from "@/lib/grading-bridge";
import { gradePinyin } from "@/grading/pinyinGrader.js";
import { gradeTones } from "@/grading/toneGrader.js";
import { normalizeMeaning } from "@/grading/meaningGrader.js";
import { toDisplayWord } from "@/grading/pinyin.js";
import { resolveConfig } from "@/grading/scale.js";
import type { StudentAnswer, WordKey as EngineWordKey } from "@/grading/index.js";
import type { Assessment, Word, WordKey } from "@/lib/database.types";

export interface PracticeAnswerInput {
  wordId: string;
  studentPinyin: string; // 성조 제외
  studentTones: number[];
  studentMeaning: string;
}

export interface PracticeIssue {
  syllableIndex?: number;
  kind: "initial" | "final" | "tone" | "meaning" | "missing" | "extra";
  expected?: string; // reveal=true일 때만 포함
  message: string;
}

export interface PracticeWordFeedback {
  wordId: string;
  hanzi: string;
  pinyinOk: boolean;
  toneOk: boolean;
  meaningOk: boolean;
  issues: PracticeIssue[];
  /** reveal=true일 때만 정답 노출 */
  correctDisplay?: string;
  acceptableMeanings?: string[];
}

export interface PracticeResult {
  reveal: boolean;
  pinyinScore: number;
  toneScore: number;
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

  const reveal = assessment.reveal_answers_in_practice;
  const config = resolveConfig(toGradingConfig(assessment));

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
    };
  });

  const pinyin = gradePinyin(engineAnswers, engineKeys, config);
  const tone = gradeTones(engineAnswers, engineKeys);

  const pinyinByWord = new Map(pinyin.details.map((d) => [d.wordId, d]));
  const toneByWord = new Map(tone.details.map((d) => [d.wordId, d]));

  const words_fb: PracticeWordFeedback[] = wordList.map((w) => {
    const k = keyByWord.get(w.id);
    const pd = pinyinByWord.get(w.id);
    const td = toneByWord.get(w.id);
    const a = ansByWord.get(w.id);

    const acceptable = new Set((k?.acceptable_meanings ?? []).map(normalizeMeaning));
    const meaningOk =
      !!a?.studentMeaning && acceptable.has(normalizeMeaning(a.studentMeaning));

    const issues: PracticeIssue[] = [];
    for (const iss of pd?.issues ?? []) {
      issues.push({
        ...(iss.syllableIndex !== undefined ? { syllableIndex: iss.syllableIndex } : {}),
        kind: iss.kind as PracticeIssue["kind"],
        ...(reveal && iss.expected !== undefined ? { expected: iss.expected } : {}),
        message: reveal ? iss.message : maskMessage(iss.kind),
      });
    }
    for (const iss of td?.issues ?? []) {
      issues.push({
        ...(iss.syllableIndex !== undefined ? { syllableIndex: iss.syllableIndex } : {}),
        kind: "tone",
        ...(reveal && iss.expected !== undefined ? { expected: iss.expected } : {}),
        message: reveal ? iss.message : `${(iss.syllableIndex ?? 0) + 1}번째 음절 성조 오류`,
      });
    }
    if (!meaningOk) {
      issues.push({ kind: "meaning", message: "의미 오답" });
    }

    const fb: PracticeWordFeedback = {
      wordId: w.id,
      hanzi: w.hanzi,
      pinyinOk: (pd?.errors ?? 0) === 0,
      toneOk: (td?.errors ?? 0) === 0,
      meaningOk,
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
      },
    }));
    if (logRows.length) await supabase.from("practice_logs").insert(logRows);
  } catch {
    /* 무시 */
  }

  return {
    reveal,
    pinyinScore: pinyin.score,
    toneScore: tone.score,
    words: words_fb,
  };
}

function maskMessage(kind: string): string {
  if (kind === "initial") return "성모 오류";
  if (kind === "final") return "운모 오류";
  if (kind === "missing") return "음절 누락";
  if (kind === "extra") return "여분 음절";
  return "오류";
}
