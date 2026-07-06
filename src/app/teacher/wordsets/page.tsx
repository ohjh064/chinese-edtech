import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { WordSetManager, type SetSummary } from "@/components/wordsets/WordSetManager";
import { TeacherTabs } from "@/components/TeacherTabs";
import { getTeacherRoster } from "@/app/actions/wordsets";
import type { Assessment, Profile } from "@/lib/database.types";

export default async function WordSetsPage() {
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
  // 단어 세트 = 연습 모드 assessment만(시험은 평가 관리 탭에서)
  const list = ((assessments ?? []) as Assessment[]).filter((a) => a.mode === "practice");
  const ids = list.map((a) => a.id);

  const wordCount = new Map<string, number>();
  const distCount = new Map<string, number>();
  if (ids.length) {
    const { data: words } = await supabase.from("words").select("assessment_id").in("assessment_id", ids);
    for (const w of (words ?? []) as { assessment_id: string }[]) wordCount.set(w.assessment_id, (wordCount.get(w.assessment_id) ?? 0) + 1);
    const { data: dists } = await supabase.from("assessment_distributions").select("assessment_id").in("assessment_id", ids);
    for (const d of (dists ?? []) as { assessment_id: string }[]) distCount.set(d.assessment_id, (distCount.get(d.assessment_id) ?? 0) + 1);
  }

  const sets: SetSummary[] = list.map((a) => ({
    id: a.id,
    title: a.title,
    description: a.unit,
    status: a.status,
    wordCount: wordCount.get(a.id) ?? 0,
    distCount: distCount.get(a.id) ?? 0,
  }));

  const roster = await getTeacherRoster();
  const hasKey = !!process.env.ANTHROPIC_API_KEY;

  return (
    <>
      <Topbar name={profile.name || "교사"} role="teacher" home="/teacher" />
      <div className="container" style={{ maxWidth: 1100 }}>
        <TeacherTabs active="wordsets" />
        <h1>단어 세트 관리</h1>
        <p className="muted">단어 세트를 만들고 단어를 입력한 뒤, 반·학생에게 배부하면 학생이 학습할 수 있습니다.</p>
        <WordSetManager initialSets={sets} roster={roster} hasKey={hasKey} />
      </div>
    </>
  );
}
