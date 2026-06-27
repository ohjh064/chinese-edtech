import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { EditAssessmentForm } from "@/components/EditAssessmentForm";
import type { WordEditInput } from "@/app/actions/teacher";
import type {
  Assessment,
  ClassRow,
  Profile,
  Word,
  WordKey,
} from "@/lib/database.types";

export default async function EditAssessmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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

  const { data: assessment } = await supabase
    .from("assessments")
    .select("*")
    .eq("id", id)
    .single<Assessment>();
  if (!assessment || assessment.teacher_id !== user.id) redirect("/teacher");

  // 문항 + 정답키(교사 RLS로 읽기 가능)
  const { data: wordRows } = await supabase
    .from("words")
    .select("*")
    .eq("assessment_id", id)
    .order("ord");
  const words = (wordRows ?? []) as Word[];

  const { data: keyRows } = words.length
    ? await supabase
        .from("word_keys")
        .select("*")
        .in(
          "word_id",
          words.map((w) => w.id),
        )
    : { data: [] as WordKey[] };
  const keyByWord = new Map(
    ((keyRows ?? []) as WordKey[]).map((k) => [k.word_id, k]),
  );

  const initialWords: WordEditInput[] = words.map((w) => {
    const k = keyByWord.get(w.id);
    return {
      id: w.id,
      hanzi: w.hanzi,
      correctPinyin: k?.correct_pinyin ?? "",
      correctTones: (k?.correct_tones ?? [])
        .map((t) => (t === 0 ? 5 : t)) // 무성조(0)는 입력 관례상 5로 표기
        .join(" "),
      acceptableMeanings: (k?.acceptable_meanings ?? []).join(", "),
      exampleSentence: k?.example_sentence ?? "",
    };
  });

  const { data: classes } = await supabase
    .from("classes")
    .select("*")
    .eq("teacher_id", user.id)
    .order("created_at", { ascending: false });

  const { count: submissionCount } = await supabase
    .from("submissions")
    .select("id", { count: "exact", head: true })
    .eq("assessment_id", id);

  return (
    <>
      <Topbar name={profile.name || "교사"} role="teacher" home="/teacher" />
      <div style={{ padding: "8px 16px" }}>
        <Link href={`/teacher/${id}`} className="muted">
          ← {assessment.title}
        </Link>
      </div>
      <EditAssessmentForm
        assessment={assessment}
        classes={(classes ?? []) as ClassRow[]}
        initialWords={initialWords}
        submissionCount={submissionCount ?? 0}
      />
    </>
  );
}
