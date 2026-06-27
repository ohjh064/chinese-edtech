import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import type { Assessment, Profile } from "@/lib/database.types";

export default async function TeacherDashboard() {
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

  const { data: assessments } = await supabase
    .from("assessments")
    .select("*")
    .eq("teacher_id", user.id)
    .order("created_at", { ascending: false });

  const { data: secret } = await supabase
    .from("teacher_secrets")
    .select("key_last4")
    .eq("teacher_id", user.id)
    .maybeSingle<{ key_last4: string | null }>();
  const hasKey = !!secret;

  return (
    <>
      <Topbar name={profile.name || "교사"} role="teacher" home="/teacher" />
      <div className="container">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <h1>평가 관리</h1>
          <div className="row">
            <Link className="btn secondary" href="/teacher/classes">
              반·학생 관리
            </Link>
            <Link className="btn secondary" href="/teacher/settings">
              설정
            </Link>
            <Link className="btn" href="/teacher/new">
              + 새 평가 출제
            </Link>
          </div>
        </div>

        {!hasKey && (
          <div className="card" style={{ borderColor: "var(--primary)" }}>
            <b>AI 채점 키 미설정</b>
            <p className="muted" style={{ fontSize: 13, margin: "4px 0 8px" }}>
              의미·문장 자동채점에는 본인 Anthropic API 키가 필요합니다. 키가 없으면 해당
              영역은 교사 직접 검토로 넘어갑니다. (본인/학생 AI 비용은 이 키로 청구)
            </p>
            <Link className="btn" href="/teacher/settings">
              API 키 설정하기
            </Link>
          </div>
        )}

        {(!assessments || assessments.length === 0) && (
          <div className="card muted">아직 출제한 평가가 없습니다.</div>
        )}

        {(assessments as Assessment[] | null)?.map((a) => (
          <div className="card" key={a.id}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div>
                <Link href={`/teacher/${a.id}`} style={{ fontSize: 17, fontWeight: 600 }}>
                  {a.title}
                </Link>
                <div className="muted" style={{ fontSize: 13 }}>
                  {a.unit ?? "단원 미지정"} · {a.mode === "exam" ? "평가" : "연습"}
                </div>
              </div>
              <span className="badge">
                {a.status === "draft" ? "초안" : a.status === "published" ? "공개" : "종료"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
