import Link from "next/link";
import { redirect } from "next/navigation";
import {
  createSupabaseServerClient,
  createSupabaseAdminClient,
} from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import type { Assessment, Profile, ScriptSubmission, ScriptWordCard } from "@/lib/database.types";

export const dynamic = "force-dynamic";

export default async function ScriptSubmissionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single<Profile>();
  if (profile?.role !== "teacher") redirect("/student");

  const { data: assessment } = await supabase
    .from("assessments")
    .select("*")
    .eq("id", id)
    .single<Assessment>();
  if (!assessment || assessment.teacher_id !== user.id) redirect("/teacher");

  // RLS: 교사는 owns_assessment로 본인 평가 제출만 read
  const { data: subsRaw } = await supabase
    .from("script_submissions")
    .select("*")
    .eq("assessment_id", id)
    .order("created_at", { ascending: false });
  const subs = (subsRaw ?? []) as ScriptSubmission[];

  const studentIds = [...new Set(subs.map((s) => s.student_id))];
  const admin = createSupabaseAdminClient();
  const { data: profs } = studentIds.length
    ? await admin.from("profiles").select("id, name, class_no").in("id", studentIds)
    : { data: [] as { id: string; name: string; class_no: string | null }[] };
  const nameById = new Map(((profs ?? []) as { id: string; name: string; class_no: string | null }[]).map((p) => [p.id, p]));

  return (
    <>
      <Topbar name={profile.name || "교사"} role="teacher" home="/teacher" />
      <div className="container">
        <Link href="/teacher/wordsets" className="muted">← 단어 세트</Link>
        <h1>대본 미션 제출 · {assessment.title}</h1>
        <p className="muted">학생이 무작위 단어로 작성한 대본과 AI 채점(총 50점) 결과입니다.</p>

        {subs.length === 0 && <div className="card muted">아직 제출된 대본이 없습니다.</div>}

        {subs.map((s) => {
          const p = nameById.get(s.student_id);
          const fb = (s.feedback ?? {}) as { overall?: string; notationIssues?: string[]; notationErrorCount?: number };
          const words = (s.words ?? []) as ScriptWordCard[];
          return (
            <div className="card" key={s.id}>
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <b style={{ fontSize: 16 }}>{p?.name ?? "학생"}</b>
                  {p?.class_no ? <span className="muted" style={{ fontSize: 13 }}> ({p.class_no})</span> : null}
                  <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>{new Date(s.created_at).toLocaleString("ko-KR")}</span>
                </div>
                <div className="row" style={{ gap: 10, alignItems: "baseline" }}>
                  <b className="score-big" style={{ fontSize: 24 }}>{s.total} / 50</b>
                  <span className="muted" style={{ fontSize: 13 }}>낱말 {s.usage_score}/30 · 병음 {s.notation_score}/20</span>
                </div>
              </div>

              {words.length > 0 && (
                <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                  {words.map((w, i) => (
                    <span key={i} className="badge">{w.hanzi}{w.pinyin ? ` ${w.pinyin}` : ""}</span>
                  ))}
                </div>
              )}

              {s.situation && <p className="muted" style={{ fontSize: 13, margin: "8px 0 0" }}>상황: {s.situation}</p>}

              <div style={{ whiteSpace: "pre-wrap", marginTop: 8, padding: "10px 12px", background: "#fbfbfc", border: "1px solid var(--border)", borderRadius: 8 }}>
                {s.script}
              </div>

              {fb.overall && <p style={{ fontSize: 14, margin: "8px 0 0" }}><b>총평:</b> {fb.overall}</p>}
              {(fb.notationIssues?.length ?? 0) > 0 && (
                <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                  {fb.notationIssues!.map((x, i) => <li key={i} style={{ fontSize: 13 }} className="muted">{x}</li>)}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
