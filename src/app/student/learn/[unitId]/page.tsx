import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import type { Profile, Situation, Unit } from "@/lib/database.types";

const DIFF_LABEL: Record<string, string> = { easy: "Easy", normal: "Normal", hard: "Hard" };

export default async function LearnUnitPage({
  params,
}: {
  params: Promise<{ unitId: string }>;
}) {
  const { unitId } = await params;
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

  // RLS: 열람 가능한 단원만
  const { data: unit } = await supabase
    .from("units")
    .select("*")
    .eq("id", unitId)
    .single<Unit>();
  if (!unit) redirect("/student/learn");

  const { data: situations } = await supabase
    .from("situations")
    .select("*")
    .eq("unit_id", unitId)
    .order("ord");
  const list = (situations ?? []) as Situation[];

  return (
    <>
      <Topbar name={profile?.name || "학생"} role="student" home="/student" />
      <div className="container">
        <Link href="/student/learn" className="muted">
          ← 회화 학습
        </Link>
        <h1>{unit.title}</h1>
        {unit.culture_note && (
          <div className="card" style={{ background: "var(--primary-weak)" }}>
            <b>문화</b>
            <p className="muted" style={{ fontSize: 14, margin: "4px 0 0" }}>{unit.culture_note}</p>
          </div>
        )}
        {list.length === 0 && <div className="card muted">아직 상황이 없습니다.</div>}
        {list.map((s) => (
          <div className="card" key={s.id}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <Link href={`/student/learn/${unitId}/${s.id}`} style={{ fontSize: 16, fontWeight: 600 }}>
                  {s.title}
                </Link>
                <div className="muted" style={{ fontSize: 13 }}>{s.description}</div>
              </div>
              <span className="badge">{DIFF_LABEL[s.difficulty] ?? s.difficulty}</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
