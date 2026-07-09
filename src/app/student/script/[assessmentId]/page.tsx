import { redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { ScriptMission } from "@/components/ScriptMission";
import type { Assessment, Profile } from "@/lib/database.types";

export default async function ScriptMissionPage({
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
  if (profile?.role === "teacher") redirect("/teacher");
  if (profile?.must_change_password) redirect("/account/password");

  const { data: assessment } = await supabase
    .from("assessments")
    .select("*")
    .eq("id", assessmentId)
    .single<Assessment>();
  if (!assessment) redirect("/student");

  let canStudy = assessment.mode === "practice" || assessment.allow_practice;
  if (!canStudy) {
    const { data: returned } = await supabase
      .from("submissions")
      .select("id")
      .eq("assessment_id", assessmentId)
      .eq("student_id", user.id)
      .not("returned_at", "is", null)
      .limit(1)
      .maybeSingle();
    canStudy = !!returned;
  }
  if (!canStudy) redirect("/student");

  return (
    <>
      <Topbar name={profile?.name || "학생"} role="student" home="/student" />
      <div className="container">
        <Link href="/student" className="muted">← 내 학습</Link>
        <h1>대본 미션 · {assessment.title}</h1>
        <p className="muted">무작위로 뽑힌 단어를 <b>모두</b> 사용해 상황에 맞는 중국어 대본을 쓰고, ‘채점하기’를 눌러 점수와 피드백을 받아요.</p>
        <ScriptMission assessmentId={assessmentId} />
      </div>
    </>
  );
}
