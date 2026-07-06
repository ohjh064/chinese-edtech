"use server";

/**
 * 교사↔학생 1:1 메시지(student_messages). 교사가 학습 현황을 보며 메시지를 보내면
 * 학생이 대시보드에서 읽고 답글. RLS로 양방향(admin 우회 불필요).
 */
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** 교사 → 학생 메시지 전송. 내 반 소속이거나 내 평가를 학습한 학생에게만 허용. */
export async function sendTeacherMessage(
  studentId: string,
  body: string,
  assessmentId?: string,
): Promise<void> {
  const text = body.trim();
  if (!text) throw new Error("메시지를 입력하세요");
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("로그인이 필요합니다");

  // 권한: 이 학생이 내 평가를 학습한 이력(RLS로 내 평가만 보임) 또는 내 반 소속인지 확인
  const { data: log } = await supabase
    .from("study_logs")
    .select("id")
    .eq("student_id", studentId)
    .limit(1)
    .maybeSingle();
  let allowed = !!log;
  if (!allowed) {
    const { data: classes } = await supabase.from("classes").select("id").eq("teacher_id", user.id);
    const classIds = (classes ?? []).map((c) => (c as { id: string }).id);
    if (classIds.length) {
      const { data: enr } = await supabase
        .from("enrollments")
        .select("student_id")
        .eq("student_id", studentId)
        .in("class_id", classIds)
        .limit(1)
        .maybeSingle();
      allowed = !!enr;
    }
  }
  if (!allowed) throw new Error("이 학생에게 메시지를 보낼 수 없습니다");

  const { error } = await supabase.from("student_messages").insert({
    teacher_id: user.id,
    student_id: studentId,
    assessment_id: assessmentId ?? null,
    sender_role: "teacher",
    body: text,
  });
  if (error) throw new Error("메시지 전송 실패");

  revalidatePath(`/teacher/student/${studentId}`);
  if (assessmentId) revalidatePath(`/teacher/${assessmentId}/learning`);
}

/** 학생 → 교사 답글. */
export async function replyToTeacher(teacherId: string, body: string): Promise<void> {
  const text = body.trim();
  if (!text) throw new Error("메시지를 입력하세요");
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("로그인이 필요합니다");

  const { error } = await supabase.from("student_messages").insert({
    teacher_id: teacherId,
    student_id: user.id,
    sender_role: "student",
    body: text,
  });
  if (error) throw new Error("답글 전송 실패");

  revalidatePath("/student");
  revalidatePath(`/teacher/student/${user.id}`);
}
