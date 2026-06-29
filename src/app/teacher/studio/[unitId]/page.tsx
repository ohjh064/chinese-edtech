import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { UnitMetaForm } from "@/components/studio/UnitMetaForm";
import { AddSituation } from "@/components/studio/AddSituation";
import type { ClassRow, Profile, Situation, Unit } from "@/lib/database.types";

const DIFF_LABEL: Record<string, string> = { easy: "Easy", normal: "Normal", hard: "Hard" };

export default async function StudioUnitPage({
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
  if (profile?.role !== "teacher") redirect("/student");

  const { data: unit } = await supabase
    .from("units")
    .select("*")
    .eq("id", unitId)
    .single<Unit>();
  if (!unit || unit.teacher_id !== user.id) redirect("/teacher/studio");

  const { data: situations } = await supabase
    .from("situations")
    .select("*")
    .eq("unit_id", unitId)
    .order("ord");
  const { data: classes } = await supabase
    .from("classes")
    .select("*")
    .eq("teacher_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <>
      <Topbar name={profile.name || "교사"} role="teacher" home="/teacher" />
      <div className="container">
        <Link href="/teacher/studio" className="muted">
          ← Teacher Studio
        </Link>
        <h1>{unit.title}</h1>

        <UnitMetaForm unit={unit} classes={(classes ?? []) as ClassRow[]} />

        <h2>상황 (롤플레이)</h2>
        <div className="card">
          <AddSituation unitId={unitId} />
        </div>
        {((situations ?? []) as Situation[]).length === 0 && (
          <div className="card muted">아직 상황이 없습니다. 상황을 추가하고 AI로 콘텐츠를 생성해 보세요.</div>
        )}
        {((situations ?? []) as Situation[]).map((s) => (
          <div className="card" key={s.id}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <Link href={`/teacher/studio/${unitId}/${s.id}`} style={{ fontSize: 16, fontWeight: 600 }}>
                  {s.title}
                </Link>
                <div className="muted" style={{ fontSize: 13 }}>
                  {s.description || "설명 미입력"}
                </div>
              </div>
              <span className="badge">{DIFF_LABEL[s.difficulty] ?? s.difficulty}</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
