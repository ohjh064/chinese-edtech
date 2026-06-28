import { redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { QuizGame } from "@/components/QuizGame";
import type { Assessment, Profile } from "@/lib/database.types";

export default async function QuizPage({
  params,
}: {
  params: Promise<{ assessmentId: string }>;
}) {
  const { assessmentId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single<Profile>();
  if (profile?.must_change_password) redirect("/account/password");

  const { data: assessment } = await supabase
    .from("assessments")
    .select("*")
    .eq("id", assessmentId)
    .single<Assessment>();
  if (!assessment) redirect("/student");

  // 퀴즈 접근: 연습 전용 / 교사 연습 허용 / 교사가 돌려준(반려) 학생
  let canPlay = assessment.mode === "practice" || assessment.allow_practice;
  if (!canPlay) {
    const { data: returned } = await supabase
      .from("submissions")
      .select("id")
      .eq("assessment_id", assessmentId)
      .eq("student_id", user.id)
      .not("returned_at", "is", null)
      .limit(1)
      .maybeSingle();
    canPlay = !!returned;
  }
  if (!canPlay) redirect("/student");

  return (
    <>
      <Topbar name={profile?.name || "학생"} role="student" home="/student" />
      <div className="container">
        <Link href="/student" className="muted">
          ← 내 평가
        </Link>
        <QuizGame assessmentId={assessmentId} title={assessment.title} />
      </div>
    </>
  );
}
