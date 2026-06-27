"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { gradeSubmissionById } from "@/lib/grading-bridge";

export interface AnswerInput {
  wordId: string;
  studentPinyin: string;
  studentTones: number[];
  studentMeaning: string;
  studentSentence: string;
}

/** 응시 시작: 진행 중 제출이 있으면 재사용, 없으면 생성 */
export async function startSubmission(assessmentId: string): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("로그인이 필요합니다");

  const { data: existing } = await supabase
    .from("submissions")
    .select("id, status")
    .eq("assessment_id", assessmentId)
    .eq("student_id", user.id)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing && existing.status === "in_progress") return existing.id;

  const { data: assessment } = await supabase
    .from("assessments")
    .select("mode")
    .eq("id", assessmentId)
    .single();

  const { data: created, error } = await supabase
    .from("submissions")
    .insert({
      assessment_id: assessmentId,
      student_id: user.id,
      mode: assessment?.mode ?? "exam",
      status: "in_progress",
      attendance: "attempted",
    })
    .select("id")
    .single();
  if (error || !created) throw new Error(error?.message ?? "응시 시작 실패");
  return created.id;
}

/** 응시 중 자동 임시저장 (PRD §12 — 네트워크 끊김 대비). 제출/채점 안 함. */
export async function saveDraft(submissionId: string, answers: AnswerInput[]) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return; // 조용히 실패(자동저장)

  const { data: submission } = await supabase
    .from("submissions")
    .select("id, student_id, status")
    .eq("id", submissionId)
    .single();
  if (!submission || submission.student_id !== user.id) return;
  if (submission.status !== "in_progress") return; // 제출 후 잠금

  for (const a of answers) {
    await supabase.from("answers").upsert(
      {
        submission_id: submissionId,
        word_id: a.wordId,
        student_pinyin: a.studentPinyin || null,
        student_tones: a.studentTones.length ? a.studentTones : null,
        student_meaning: a.studentMeaning || null,
        student_sentence: a.studentSentence || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "submission_id,word_id" },
    );
  }
}

export interface DraftAnswer {
  wordId: string;
  studentPinyin: string;
  studentTones: number[];
  studentMeaning: string;
  studentSentence: string;
}

/** 이어서 응시: 저장된 임시 답안 불러오기 */
export async function getDraft(submissionId: string): Promise<DraftAnswer[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("answers")
    .select("word_id, student_pinyin, student_tones, student_meaning, student_sentence")
    .eq("submission_id", submissionId);
  return (data ?? []).map((a: {
    word_id: string;
    student_pinyin: string | null;
    student_tones: number[] | null;
    student_meaning: string | null;
    student_sentence: string | null;
  }) => ({
    wordId: a.word_id,
    studentPinyin: a.student_pinyin ?? "",
    studentTones: a.student_tones ?? [],
    studentMeaning: a.student_meaning ?? "",
    studentSentence: a.student_sentence ?? "",
  }));
}

/** 답안 제출 → 저장 → 자동채점 → 결과 페이지 이동 */
export async function submitAnswers(
  submissionId: string,
  answers: AnswerInput[],
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("로그인이 필요합니다");

  // 소유권 확인(RLS도 강제하지만 명시 체크)
  const { data: submission } = await supabase
    .from("submissions")
    .select("id, student_id, status")
    .eq("id", submissionId)
    .single();
  if (!submission || submission.student_id !== user.id) {
    throw new Error("권한이 없습니다");
  }
  if (submission.status !== "in_progress") {
    throw new Error("이미 제출된 답안입니다"); // 제출 후 수정 잠금 (§12)
  }

  for (const a of answers) {
    await supabase.from("answers").upsert(
      {
        submission_id: submissionId,
        word_id: a.wordId,
        student_pinyin: a.studentPinyin || null,
        student_tones: a.studentTones.length ? a.studentTones : null,
        student_meaning: a.studentMeaning || null,
        student_sentence: a.studentSentence || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "submission_id,word_id" },
    );
  }

  await supabase
    .from("submissions")
    .update({ status: "submitted", submitted_at: new Date().toISOString() })
    .eq("id", submissionId);

  // 병음·성조 즉시 자동채점(+ AI 키 있으면 의미·문장). 서버에서 정답키 읽음.
  await gradeSubmissionById(submissionId);

  redirect(`/student/result/${submissionId}`);
}
