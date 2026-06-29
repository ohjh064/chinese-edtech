import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import type { Profile, Unit } from "@/lib/database.types";

export default async function LearnIndex() {
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

  // RLS: 배포(published) + 소속 반 단원만 조회됨
  const { data: units } = await supabase
    .from("units")
    .select("*")
    .eq("published", true)
    .order("ord");
  const list = (units ?? []) as Unit[];

  return (
    <>
      <Topbar name={profile?.name || "학생"} role="student" home="/student" />
      <div className="container">
        <Link href="/student" className="muted">
          ← 내 평가
        </Link>
        <h1>회화 학습</h1>
        <p className="muted">단원과 상황을 골라 핵심 표현을 익히고 발음을 들어보세요. (AI 대화는 곧 제공)</p>
        {list.length === 0 && (
          <div className="card muted">아직 열린 회화 단원이 없습니다.</div>
        )}
        {list.map((u) => (
          <div className="card" key={u.id}>
            <Link href={`/student/learn/${u.id}`} style={{ fontSize: 17, fontWeight: 600 }}>
              {u.title}
            </Link>
            <div className="muted" style={{ fontSize: 13 }}>
              {[u.subtitle, u.theme].filter(Boolean).join(" · ")}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
