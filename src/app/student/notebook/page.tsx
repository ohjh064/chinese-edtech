import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { MistakeNotebook } from "@/components/MistakeNotebook";
import { getMistakes } from "@/app/actions/mistakes";
import type { Profile } from "@/lib/database.types";

export default async function NotebookPage() {
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

  const summary = await getMistakes();

  return (
    <>
      <Topbar name={profile?.name || "학생"} role="student" home="/student" />
      <div className="container">
        <Link href="/student" className="muted">
          ← 내 평가
        </Link>
        <h1>AI 오답노트</h1>
        <p className="muted">연습 모드에서 틀린 부분이 자동으로 모입니다. AI가 약점만 골라 맞춤 연습을 만들어줘요.</p>
        <MistakeNotebook initial={summary} />
      </div>
    </>
  );
}
