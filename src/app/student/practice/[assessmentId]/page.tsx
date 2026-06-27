import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { PracticeForm, type PracticeWord } from "@/components/PracticeForm";
import type { Assessment, Profile, Word } from "@/lib/database.types";

export default async function PracticePage({
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

  const { data: wordRows } = await supabase
    .from("words")
    .select("*")
    .eq("assessment_id", assessmentId)
    .order("ord");
  const words: PracticeWord[] = ((wordRows ?? []) as Word[]).map((w) => ({
    id: w.id,
    hanzi: w.hanzi,
  }));

  return (
    <>
      <Topbar name={profile?.name || "학생"} role="student" home="/student" />
      <div className="container">
        <h1>연습 · {assessment.title}</h1>
        <p className="muted">
          {assessment.unit} · 무제한 연습 — 입력 후 “채점하기”로 즉시 피드백을 받으세요.
        </p>
        <PracticeForm assessmentId={assessmentId} words={words} />
      </div>
    </>
  );
}
