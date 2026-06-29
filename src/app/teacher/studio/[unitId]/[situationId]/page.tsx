import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { SituationEditor } from "@/components/studio/SituationEditor";
import type { ExpressionRow, QuestionRow } from "@/app/actions/studio";
import type { Expression, Profile, Question, Situation, Unit } from "@/lib/database.types";

export default async function StudioSituationPage({
  params,
}: {
  params: Promise<{ unitId: string; situationId: string }>;
}) {
  const { unitId, situationId } = await params;
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

  const { data: unit } = await supabase
    .from("units")
    .select("*")
    .eq("id", unitId)
    .single<Unit>();
  if (!unit || unit.teacher_id !== user.id) redirect("/teacher/studio");

  const { data: situation } = await supabase
    .from("situations")
    .select("*")
    .eq("id", situationId)
    .single<Situation>();
  if (!situation || situation.unit_id !== unitId) redirect(`/teacher/studio/${unitId}`);

  const { data: exprs } = await supabase
    .from("expressions")
    .select("*")
    .eq("situation_id", situationId)
    .order("ord");
  const { data: qs } = await supabase
    .from("questions")
    .select("*")
    .eq("situation_id", situationId)
    .order("ord");

  const initialExpressions: ExpressionRow[] = ((exprs ?? []) as Expression[]).map((e) => ({
    id: e.id,
    hanzi: e.hanzi,
    pinyin: e.pinyin ?? "",
    meaning: e.meaning ?? "",
  }));
  const initialQuestions: QuestionRow[] = ((qs ?? []) as Question[]).map((q) => ({
    id: q.id,
    promptZh: q.prompt_zh,
    promptKo: q.prompt_ko ?? "",
    modelAnswerZh: q.model_answer_zh ?? "",
    modelAnswerKo: q.model_answer_ko ?? "",
  }));

  return (
    <>
      <Topbar name={profile.name || "교사"} role="teacher" home="/teacher" />
      <div className="container">
        <Link href={`/teacher/studio/${unitId}`} className="muted">
          ← {unit.title}
        </Link>
        <h1>{situation.title}</h1>
        <SituationEditor
          unitId={unitId}
          unitTheme={unit.theme ?? unit.title}
          situation={situation}
          initialExpressions={initialExpressions}
          initialQuestions={initialQuestions}
        />
      </div>
    </>
  );
}
