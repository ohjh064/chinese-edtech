/**
 * 학습/퀴즈 접근 권한 검사(공유 헬퍼). 서버 액션들이 공용으로 쓴다.
 * 연습 허용 조건: mode='practice' 또는 allow_practice, 또는 교사가 반려(returned_at)한 학생.
 */
import type { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Assessment } from "@/lib/database.types";

export async function assertCanPractice(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  assessmentId: string,
  userId: string,
): Promise<Assessment> {
  const { data: assessment } = await supabase
    .from("assessments")
    .select("*")
    .eq("id", assessmentId)
    .single<Assessment>();
  if (!assessment) throw new Error("접근할 수 없는 평가입니다");
  let can = assessment.mode === "practice" || assessment.allow_practice;
  if (!can) {
    const { data: returned } = await supabase
      .from("submissions")
      .select("id")
      .eq("assessment_id", assessmentId)
      .eq("student_id", userId)
      .not("returned_at", "is", null)
      .limit(1)
      .maybeSingle();
    can = !!returned;
  }
  if (!can) throw new Error("퀴즈가 허용되지 않은 평가입니다");
  return assessment;
}
