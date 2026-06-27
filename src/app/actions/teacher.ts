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

/** 수정용 문항: 기존 문항이면 id 보유, 새 문항이면 id 없음 */
export interface WordEditInput extends WordInput {
  id?: string;
}

export interface UpdateAssessmentInput
  extends Omit<CreateAssessmentInput, "words"> {
  words: WordEditInput[];
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

/** 병음 음절 수(입력 칸 수 힌트) */
function syllableCount(correctPinyin: string): number {
  return correctPinyin.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * classId가 호출 교사 소유의 반인지 서버에서 검증한다.
 * (RLS는 assessments.class_id 값까지 검사하지 않으므로, 위·변조된 요청이 다른 교사의
 *  반으로 평가를 노출시키지 못하도록 막는다.)
 */
async function assertOwnsClassIfSet(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  teacherId: string,
  classId: string | null | undefined,
) {
  if (!classId) return;
  const { data: cls } = await supabase
    .from("classes")
    .select("id")
    .eq("id", classId)
    .eq("teacher_id", teacherId)
    .maybeSingle();
  if (!cls) throw new Error("권한이 없는 반입니다");
}

export async function createAssessment(input: CreateAssessmentInput) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("로그인이 필요합니다");
  await assertOwnsClassIfSet(supabase, user.id, input.classId);

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
        syllable_count: syllableCount(w.correctPinyin),
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
  revalidatePath("/teacher");
}

/** 종료 취소(재개): 종료된 평가를 다시 공개 상태로 되돌려 응시를 재개한다. */
export async function reopenAssessment(assessmentId: string) {
  const supabase = await createSupabaseServerClient();
  // RLS(assessments_teacher_all)로 출제 교사만 수정 가능.
  await supabase
    .from("assessments")
    .update({ status: "published" })
    .eq("id", assessmentId);
  revalidatePath(`/teacher/${assessmentId}`);
  revalidatePath(`/teacher/${assessmentId}/monitor`);
  revalidatePath("/teacher");
}

/** 회수: 공개된 평가를 초안으로 되돌린다(학생 목록에서 숨김). */
export async function unpublishAssessment(assessmentId: string) {
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("assessments")
    .update({ status: "draft" })
    .eq("id", assessmentId);
  revalidatePath(`/teacher/${assessmentId}`);
  revalidatePath("/teacher");
}

/**
 * 수행평가 수정: 메타데이터 + 문항/정답키를 갱신한다.
 * 문항은 diff 방식 — 기존(id 보유) 문항은 갱신, 새 문항은 추가, 빠진 문항만 삭제한다.
 * 삭제 시 cascade로 해당 문항의 정답키·학생 답안이 함께 제거되므로 폼에서 경고한다.
 */
export async function updateAssessment(
  assessmentId: string,
  input: UpdateAssessmentInput,
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("로그인이 필요합니다");

  // 소유권 확인(RLS도 강제하지만 명시 체크)
  const { data: existing } = await supabase
    .from("assessments")
    .select("id, teacher_id")
    .eq("id", assessmentId)
    .single<{ id: string; teacher_id: string }>();
  if (!existing || existing.teacher_id !== user.id) {
    throw new Error("권한이 없습니다");
  }
  await assertOwnsClassIfSet(supabase, user.id, input.classId);

  const { error: aErr } = await supabase
    .from("assessments")
    .update({
      title: input.title,
      unit: input.unit ?? null,
      class_id: input.classId ?? null,
      mode: input.mode,
      time_limit_sec: input.timeLimitSec ?? null,
      attempts_allowed: input.attemptsAllowed,
      sentence_task_type: input.sentenceTaskType,
      pinyin_error_unit: input.pinyinErrorUnit,
      meaning_partial_weight: input.meaningPartialWeight,
      reveal_answers_in_practice: input.revealAnswersInPractice,
      proctoring: input.proctoring,
    })
    .eq("id", assessmentId);
  if (aErr) throw new Error(aErr.message);

  // 기존 문항 id 집합
  const { data: existingWords } = await supabase
    .from("words")
    .select("id")
    .eq("assessment_id", assessmentId);
  const existingIds = new Set(
    (existingWords ?? []).map((w: { id: string }) => w.id),
  );
  const keptIds = new Set<string>();

  for (let i = 0; i < input.words.length; i++) {
    const w = input.words[i]!;
    const keyFields = {
      correct_pinyin: w.correctPinyin.trim(),
      correct_tones: parseTones(w.correctTones),
      acceptable_meanings: parseMeanings(w.acceptableMeanings),
      example_sentence: w.exampleSentence?.trim() || null,
    };

    if (w.id && existingIds.has(w.id)) {
      keptIds.add(w.id);
      const { error: wErr } = await supabase
        .from("words")
        .update({
          ord: i,
          hanzi: w.hanzi,
          syllable_count: syllableCount(w.correctPinyin),
        })
        .eq("id", w.id);
      if (wErr) throw new Error(wErr.message);
      const { error: kErr } = await supabase
        .from("word_keys")
        .upsert({ word_id: w.id, ...keyFields }, { onConflict: "word_id" });
      if (kErr) throw new Error(kErr.message);
    } else {
      const { data: word, error: wErr } = await supabase
        .from("words")
        .insert({
          assessment_id: assessmentId,
          ord: i,
          hanzi: w.hanzi,
          syllable_count: syllableCount(w.correctPinyin),
        })
        .select("id")
        .single();
      if (wErr || !word) throw new Error(wErr?.message ?? "문항 저장 실패");
      const { error: kErr } = await supabase
        .from("word_keys")
        .insert({ word_id: word.id, ...keyFields });
      if (kErr) throw new Error(kErr.message);
    }
  }

  // 폼에서 제거된 문항 삭제(cascade: word_keys·answers 정리)
  const toDelete = [...existingIds].filter((id) => !keptIds.has(id));
  if (toDelete.length) {
    const { error: dErr } = await supabase
      .from("words")
      .delete()
      .in("id", toDelete);
    if (dErr) throw new Error(dErr.message);
  }

  revalidatePath("/teacher");
  revalidatePath(`/teacher/${assessmentId}`);
  revalidatePath(`/teacher/${assessmentId}/edit`);
  revalidatePath(`/teacher/${assessmentId}/monitor`);
  redirect(`/teacher/${assessmentId}`);
}

/**
 * 평가의 모든 제출물을 재채점한다(정답키 수정 후 점수 갱신용).
 * 교사가 이미 확정(teacher_finalized)한 제출물은 교사 판단을 덮어쓰지 않도록 건너뛴다.
 */
export async function regradeAllSubmissions(
  assessmentId: string,
): Promise<{ regraded: number; skipped: number }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("로그인이 필요합니다");

  const { data: assessment } = await supabase
    .from("assessments")
    .select("id, teacher_id")
    .eq("id", assessmentId)
    .single<{ id: string; teacher_id: string }>();
  if (!assessment || assessment.teacher_id !== user.id) {
    throw new Error("권한이 없습니다");
  }

  // 진행 중(미제출)은 채점 대상 아님
  const { data: subs } = await supabase
    .from("submissions")
    .select("id")
    .eq("assessment_id", assessmentId)
    .neq("status", "in_progress");
  const submissionIds = (subs ?? []).map((s: { id: string }) => s.id);
  if (!submissionIds.length) return { regraded: 0, skipped: 0 };

  const { data: gradeRows } = await supabase
    .from("grades")
    .select("submission_id, teacher_finalized")
    .in("submission_id", submissionIds);
  const finalized = new Set(
    (gradeRows ?? [])
      .filter((g: { teacher_finalized: boolean }) => g.teacher_finalized)
      .map((g: { submission_id: string }) => g.submission_id),
  );

  let regraded = 0;
  for (const id of submissionIds) {
    if (finalized.has(id)) continue;
    await gradeSubmissionById(id);
    regraded++;
  }

  revalidatePath(`/teacher/${assessmentId}`);
  revalidatePath(`/teacher/${assessmentId}/monitor`);
  return { regraded, skipped: finalized.size };
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
