import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { TeacherTabs } from "@/components/TeacherTabs";
import { QuestionBankManager } from "@/components/questionbank/QuestionBankManager";
import { getTeacherRoster } from "@/app/actions/wordsets";
import type { Profile, QbankType, QbankExample, QbankSet } from "@/lib/database.types";

export default async function QuestionBankPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single<Profile>();
  if (profile?.role !== "teacher") redirect("/student");

  const [{ data: types }, { data: examples }, { data: settings }, { data: sets }, { data: secret }] =
    await Promise.all([
      supabase.from("qbank_types").select("*").eq("teacher_id", user.id).order("ord"),
      supabase.from("qbank_examples").select("*").eq("teacher_id", user.id).order("created_at"),
      supabase.from("qbank_settings").select("guidelines").eq("teacher_id", user.id).maybeSingle<{ guidelines: string | null }>(),
      supabase.from("qbank_sets").select("*").eq("teacher_id", user.id).order("created_at", { ascending: false }),
      supabase.from("teacher_secrets").select("key_last4").eq("teacher_id", user.id).maybeSingle<{ key_last4: string | null }>(),
    ]);

  // 세트별 문항 수
  const setList = (sets ?? []) as QbankSet[];
  const counts = new Map<string, number>();
  if (setList.length) {
    const { data: items } = await supabase
      .from("qbank_items")
      .select("set_id")
      .in("set_id", setList.map((s) => s.id));
    for (const it of (items ?? []) as { set_id: string }[]) counts.set(it.set_id, (counts.get(it.set_id) ?? 0) + 1);
  }
  const setsWithCount = setList.map((s) => ({ ...s, itemCount: counts.get(s.id) ?? 0 }));

  const hasKey = !!secret || !!process.env.ANTHROPIC_API_KEY;
  const roster = await getTeacherRoster();

  return (
    <>
      <Topbar name={profile?.name || "교사"} role="teacher" home="/teacher" />
      <div className="container" style={{ maxWidth: 1100 }}>
        <TeacherTabs active="question-bank" />
        <h1>문제 은행 · 시험문제 출제</h1>
        <p className="muted">
          유형별 기출 예시를 등록해 스타일을 학습시키고, 지문을 넣으면 AI가 발문·선지·정답·해설을 생성합니다.
        </p>
        <QuestionBankManager
          hasKey={hasKey}
          initialTypes={(types ?? []) as QbankType[]}
          initialExamples={(examples ?? []) as QbankExample[]}
          initialGuidelines={settings?.guidelines ?? ""}
          initialSets={setsWithCount}
          roster={roster}
        />
      </div>
    </>
  );
}
