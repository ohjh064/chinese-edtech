import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { NewAssessmentForm } from "@/components/NewAssessmentForm";
import type { ClassRow, Profile } from "@/lib/database.types";

export default async function NewAssessmentPage() {
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

  const { data: classes } = await supabase
    .from("classes")
    .select("*")
    .eq("teacher_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <>
      <Topbar name={profile.name || "교사"} role="teacher" home="/teacher" />
      <div style={{ padding: "8px 16px" }}>
        <Link href="/teacher" className="muted">
          ← 평가 목록
        </Link>
      </div>
      <NewAssessmentForm classes={(classes ?? []) as ClassRow[]} />
    </>
  );
}
