import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { QbankSolve } from "@/components/QbankSolve";
import { getSharedQbankForStudent } from "@/app/actions/question-bank";
import type { Profile } from "@/lib/database.types";

export default async function StudentQbankPage({
  params,
}: {
  params: Promise<{ setId: string }>;
}) {
  const { setId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single<Profile>();
  if (profile?.role === "teacher") redirect("/teacher");
  if (profile?.must_change_password) redirect("/account/password");

  let data;
  try {
    data = await getSharedQbankForStudent(setId);
  } catch {
    redirect("/student");
  }

  return (
    <>
      <Topbar name={profile?.name || "학생"} role="student" home="/student" />
      <div className="container">
        <Link href="/student" className="muted">← 내 학습</Link>
        <h1>{data.title}</h1>
        <p className="muted">문제를 풀고 “채점하기”를 누르면 점수와 정답·해설을 볼 수 있어요.</p>
        <QbankSolve setId={setId} data={data} />
      </div>
    </>
  );
}
