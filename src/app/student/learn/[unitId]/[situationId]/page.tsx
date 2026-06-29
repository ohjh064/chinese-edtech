import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { SpeakButton } from "@/components/SpeakButton";
import type { Expression, Profile, Situation, Unit } from "@/lib/database.types";

export default async function LearnSituationPage({
  params,
}: {
  params: Promise<{ unitId: string; situationId: string }>;
}) {
  const { unitId, situationId } = await params;
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

  const { data: unit } = await supabase
    .from("units")
    .select("*")
    .eq("id", unitId)
    .single<Unit>();
  if (!unit) redirect("/student/learn");
  const { data: situation } = await supabase
    .from("situations")
    .select("*")
    .eq("id", situationId)
    .single<Situation>();
  if (!situation) redirect(`/student/learn/${unitId}`);

  const { data: exprs } = await supabase
    .from("expressions")
    .select("*")
    .eq("situation_id", situationId)
    .order("ord");
  const list = (exprs ?? []) as Expression[];

  return (
    <>
      <Topbar name={profile?.name || "학생"} role="student" home="/student" />
      <div className="container">
        <Link href={`/student/learn/${unitId}`} className="muted">
          ← {unit.title}
        </Link>
        <h1>{situation.title}</h1>
        {situation.description && <p className="muted">{situation.description}</p>}
        {(situation.role_student || situation.role_ai) && (
          <p className="muted" style={{ fontSize: 14 }}>
            역할 — 나: {situation.role_student || "—"} · AI: {situation.role_ai || "—"}
          </p>
        )}

        <h2>핵심 표현</h2>
        {list.length === 0 && <div className="card muted">표현이 아직 없습니다.</div>}
        {list.map((e) => (
          <div className="card" key={e.id}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <span style={{ fontSize: 22, fontWeight: 700 }}>{e.hanzi}</span>
                {e.pinyin && <span className="pill-preview muted" style={{ marginLeft: 10 }}>{e.pinyin}</span>}
                {e.meaning && <div className="muted" style={{ fontSize: 14 }}>{e.meaning}</div>}
              </div>
              <SpeakButton hanzi={e.hanzi} />
            </div>
          </div>
        ))}

        <div className="card" style={{ background: "var(--primary-weak)" }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <b>AI 롤플레이 대화</b>
              <p className="muted" style={{ fontSize: 13, margin: "4px 0 0" }}>
                이 상황으로 AI와 직접 대화하며 1:1 코칭을 받아보세요.
              </p>
            </div>
            <Link className="btn" href={`/student/learn/${unitId}/${situationId}/roleplay`}>
              대화 시작 →
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
