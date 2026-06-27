import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { TakeForm, type TakeWord } from "@/components/TakeForm";
import type { Assessment, Profile, Word } from "@/lib/database.types";

export default async function TakePage({
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

  // RLS: 응시 가능한(published+내 반) 평가만 읽힘
  const { data: assessment } = await supabase
    .from("assessments")
    .select("*")
    .eq("id", assessmentId)
    .single<Assessment>();
  if (!assessment) redirect("/student");

  // 정답키 없는 문항 정보만(words 테이블) — RLS로 정답키 분리 보호
  const { data: wordRows } = await supabase
    .from("words")
    .select("*")
    .eq("assessment_id", assessmentId)
    .order("ord");

  const words: TakeWord[] = ((wordRows ?? []) as Word[]).map((w) => ({
    id: w.id,
    ord: w.ord,
    hanzi: w.hanzi,
    errorPrompt: w.error_prompt,
  }));

  return (
    <>
      <Topbar name={profile?.name || "학생"} role="student" home="/student" />
      <div className="container">
        <h1>{assessment.title}</h1>
        <p className="muted">{assessment.unit}</p>
        <TakeForm
          assessmentId={assessmentId}
          words={words}
          sentenceTaskType={assessment.sentence_task_type}
          timeLimitSec={assessment.time_limit_sec}
          proctoring={assessment.proctoring}
        />
      </div>
    </>
  );
}
