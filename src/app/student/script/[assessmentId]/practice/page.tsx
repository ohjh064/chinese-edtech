import { redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { SentenceBuilder } from "@/components/SentenceBuilder";
import {
  getScriptSentenceBuilder,
  gradeScriptSentence,
  scriptSentenceHint,
  askScriptOrderTutor,
} from "@/app/actions/script-mission";
import type { Assessment, Profile } from "@/lib/database.types";
import type { BuilderItem } from "@/app/actions/sentence-builder";

export const dynamic = "force-dynamic";

export default async function ScriptPracticePage({
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

  let items: BuilderItem[] = [];
  let error: string | null = null;
  try {
    items = await getScriptSentenceBuilder(assessmentId);
  } catch (e) {
    error = e instanceof Error ? e.message : "연습 문항을 불러오지 못했어요.";
  }

  return (
    <>
      <Topbar name={profile?.name || "학생"} role="student" home="/student" />
      <div className="container">
        <Link href={`/student/script/${assessmentId}`} className="muted">← 대본 미션</Link>
        <h1>표현 문장 배열 · {assessment.title}</h1>
        <p className="muted">
          대본에 필요한 표현을 낱말 배열로 익혀요. 어순이 헷갈리면 <b>‘어순 튜터’</b>에게 물어보세요 — 정답을 알려주진 않지만
          중국어 어순을 기초부터 차근차근 알려줘요.
        </p>
        {error ? (
          <div className="card">
            <p className="error" style={{ margin: 0 }}>{error}</p>
            <p className="muted" style={{ fontSize: 13, margin: "6px 0 0" }}>잠시 후 새로고침하거나 대본 미션으로 돌아가세요.</p>
          </div>
        ) : (
          <SentenceBuilder
            items={items}
            onGrade={gradeScriptSentence.bind(null, assessmentId)}
            onHint={scriptSentenceHint.bind(null, assessmentId)}
            tutorAsk={askScriptOrderTutor.bind(null, assessmentId)}
          />
        )}
      </div>
    </>
  );
}
