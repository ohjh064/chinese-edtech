"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { gradeSubmissionById } from "@/lib/grading-bridge";
import { encryptSecret, lastFour } from "@/lib/crypto";
import type {
  PinyinErrorUnitDb,
  SentenceTaskTypeDb,
} from "@/lib/database.types";

export interface WordInput {
  hanzi: string;
  correctPinyin: string;
  /** "3 3" 형식 또는 빈 값 */
  correctTones: string;
  /** 쉼표 구분 */
  acceptableMeanings: string;
  exampleSentence?: string;
}

export interface CreateAssessmentInput {
  title: string;
  unit?: string;
  classId?: string | null;
  mode: "practice" | "exam";
  sentenceTaskType: SentenceTaskTypeDb;
  pinyinErrorUnit: PinyinErrorUnitDb;
  meaningPartialWeight: number; // 1 | 0.5
  timeLimitSec?: number | null;
  attemptsAllowed: number;
  revealAnswersInPractice: boolean;
  proctoring: boolean;
  words: WordInput[];
}

function parseTones(s: string): number[] {
  return s
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => {
      const n = Number(t);
      return Number.isFinite(n) ? (n === 5 ? 0 : n) : 0;
    });
}

function parseMeanings(s: string): string[] {
  return s
    .split(/[,，]/)
    .map((m) => m.trim())
    .filter(Boolean);
}

export async function createAssessment(input: CreateAssessmentInput) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("로그인이 필요합니다");

  const { data: assessment, error } = await supabase
    .from("assessments")
    .insert({
      title: input.title,
      unit: input.unit ?? null,
      teacher_id: user.id,
      class_id: input.classId ?? null,
      mode: input.mode,
      time_limit_sec: input.timeLimitSec ?? null,
      attempts_allowed: input.attemptsAllowed,
      sentence_task_type: input.sentenceTaskType,
      pinyin_error_unit: input.pinyinErrorUnit,
      meaning_partial_weight: input.meaningPartialWeight,
      reveal_answers_in_practice: input.revealAnswersInPractice,
      proctoring: input.proctoring,
      status: "draft",
    })
    .select("id")
    .single();
  if (error || !assessment) throw new Error(error?.message ?? "출제 실패");

  // 문항 + 정답키 삽입
  for (let i = 0; i < input.words.length; i++) {
    const w = input.words[i]!;
    const { data: word, error: wErr } = await supabase
      .from("words")
      .insert({
        assessment_id: assessment.id,
        ord: i,
        hanzi: w.hanzi,
        syllable_count: w.correctPinyin.trim().split(/\s+/).filter(Boolean).length,
      })
      .select("id")
      .single();
    if (wErr || !word) throw new Error(wErr?.message ?? "문항 저장 실패");

    const { error: kErr } = await supabase.from("word_keys").insert({
      word_id: word.id,
      correct_pinyin: w.correctPinyin.trim(),
      correct_tones: parseTones(w.correctTones),
      acceptable_meanings: parseMeanings(w.acceptableMeanings),
      example_sentence: w.exampleSentence?.trim() || null,
    });
    if (kErr) throw new Error(kErr.message);
  }

  revalidatePath("/teacher");
  redirect(`/teacher/${assessment.id}`);
}

export async function publishAssessment(assessmentId: string) {
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("assessments")
    .update({ status: "published" })
    .eq("id", assessmentId);
  revalidatePath(`/teacher/${assessmentId}`);
}

export async function closeAssessment(assessmentId: string) {
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("assessments")
    .update({ status: "closed" })
    .eq("id", assessmentId);
  revalidatePath(`/teacher/${assessmentId}`);
}

/** 교사 확정: 점수 오버라이드(선택) 후 finalized 처리 (PRD §5.4 교사 확정) */
export async function finalizeGrade(
  submissionId: string,
  overrides?: { meaning_score?: number; sentence_score?: number },
) {
  const supabase = await createSupabaseServerClient();

  const { data: grade } = await supabase
    .from("grades")
    .select("*")
    .eq("submission_id", submissionId)
    .single();
  if (!grade) throw new Error("채점 결과가 없습니다");

  const meaning = overrides?.meaning_score ?? grade.meaning_score;
  const sentence = overrides?.sentence_score ?? grade.sentence_score;
  const total = grade.pinyin_score + grade.tone_score + meaning + sentence;
  const final = Math.max(total, 20); // 응시자 하한 (PRD §5.5)

  await supabase
    .from("grades")
    .update({
      meaning_score: meaning,
      sentence_score: sentence,
      total,
      final,
      teacher_finalized: true,
      finalized_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("submission_id", submissionId);

  revalidatePath(`/teacher`);
}

/** AI 재채점(교사 본인 키 사용). 학생 제출 후 교사가 키를 설정/변경한 경우 등. */
export async function regradeSubmission(submissionId: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("로그인이 필요합니다");

  // 본인 평가의 제출인지 확인(RLS도 강제)
  const { data: sub } = await supabase
    .from("submissions")
    .select("id, assessment_id")
    .eq("id", submissionId)
    .single();
  if (!sub) throw new Error("제출물을 찾을 수 없습니다");

  await gradeSubmissionById(submissionId);
  revalidatePath(`/teacher`);
}

// ───────────────────── 교사 API 키(BYOK) ─────────────────────

/** 교사가 본인 Anthropic API 키 저장(암호화). 그 교사/학생 AI 채점에 사용·과금. */
export async function setAnthropicKey(plainKey: string) {
  const key = plainKey.trim();
  if (!key.startsWith("sk-ant-")) {
    throw new Error("올바른 Anthropic API 키 형식이 아닙니다(sk-ant-…).");
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("로그인이 필요합니다");

  const { error } = await supabase.from("teacher_secrets").upsert(
    {
      teacher_id: user.id,
      anthropic_key_encrypted: encryptSecret(key),
      key_last4: lastFour(key),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "teacher_id" },
  );
  if (error) throw new Error(error.message);
  revalidatePath("/teacher/settings");
}

export async function removeAnthropicKey() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("로그인이 필요합니다");
  await supabase.from("teacher_secrets").delete().eq("teacher_id", user.id);
  revalidatePath("/teacher/settings");
}
