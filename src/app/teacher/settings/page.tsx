import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { ApiKeyForm } from "@/components/ApiKeyForm";
import type { Profile, TeacherSecret } from "@/lib/database.types";

export default async function TeacherSettings() {
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

  const { data: secret } = await supabase
    .from("teacher_secrets")
    .select("key_last4")
    .eq("teacher_id", user.id)
    .maybeSingle<Pick<TeacherSecret, "key_last4">>();

  return (
    <>
      <Topbar name={profile.name || "교사"} role="teacher" home="/teacher" />
      <div className="container">
        <Link href="/teacher" className="muted">
          ← 평가 목록
        </Link>
        <h1>설정</h1>
        <ApiKeyForm last4={secret?.key_last4 ?? null} />
      </div>
    </>
  );
}
