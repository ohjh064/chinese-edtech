import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { TeacherTabs } from "@/components/TeacherTabs";
import { StudioStart } from "@/components/studio/StudioStart";
import type { Profile, Unit } from "@/lib/database.types";

export default async function StudioIndex() {
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

  const { data: units } = await supabase
    .from("units")
    .select("*")
    .eq("teacher_id", user.id)
    .order("ord");
  const list = (units ?? []) as Unit[];

  return (
    <>
      <Topbar name={profile.name || "교사"} role="teacher" home="/teacher" />
      <div className="container">
        <TeacherTabs active="studio" />
        <h1>회화 세트 · Teacher Studio</h1>
        <p className="muted">
          교과서 단원과 상황(롤플레이)을 만들고 배포하세요. AI로 상황을 자동 생성할 수 있습니다.
        </p>

        <StudioStart hasUnits={list.length > 0} />

        {list.length === 0 && (
          <div className="card muted">
            아직 단원이 없습니다. 위에서 “교과서 8단원 불러오기” 또는 새 단원을 만드세요.
          </div>
        )}
        {list.map((u) => (
          <div className="card" key={u.id}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <Link href={`/teacher/studio/${u.id}`} style={{ fontSize: 17, fontWeight: 600 }}>
                  {u.title}
                </Link>
                <div className="muted" style={{ fontSize: 13 }}>
                  {[u.subtitle, u.theme].filter(Boolean).join(" · ") || "구성 미입력"}
                </div>
              </div>
              <span className="badge">{u.published ? "배포됨" : "미배포"}</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
