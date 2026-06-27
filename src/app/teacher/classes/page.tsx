import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { RosterManager } from "@/components/RosterManager";
import type { ClassRow, Profile } from "@/lib/database.types";

export default async function ClassesPage() {
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
  const classList = (classes ?? []) as ClassRow[];

  // 반별 학생 목록(재설정용)
  const classIds = classList.map((c) => c.id);
  const { data: enrollments } = classIds.length
    ? await supabase
        .from("enrollments")
        .select("class_id, student:profiles(id, name, class_no, email)")
        .in("class_id", classIds)
    : { data: [] as unknown[] };

  const studentsByClass: Record<string, StudentLite[]> = {};
  for (const row of (enrollments ?? []) as EnrollmentRow[]) {
    const s = Array.isArray(row.student) ? row.student[0] : row.student;
    if (!s) continue;
    (studentsByClass[row.class_id] ??= []).push(s);
  }
  for (const list of Object.values(studentsByClass)) {
    list.sort((a, b) => (a.class_no ?? "").localeCompare(b.class_no ?? "", "ko", { numeric: true }));
  }

  return (
    <>
      <Topbar name={profile.name || "교사"} role="teacher" home="/teacher" />
      <div className="container">
        <Link href="/teacher" className="muted">
          ← 평가 목록
        </Link>
        <h1>반 · 학생 관리</h1>
        <RosterManager classes={classList} studentsByClass={studentsByClass} />
      </div>
    </>
  );
}

interface StudentLite {
  id: string;
  name: string;
  class_no: string | null;
  email: string | null;
}
interface EnrollmentRow {
  class_id: string;
  student: StudentLite | StudentLite[] | null;
}
