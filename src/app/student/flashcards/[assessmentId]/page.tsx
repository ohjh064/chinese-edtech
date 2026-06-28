import { redirect } from "next/navigation";
import Link from "next/link";
import {
  createSupabaseServerClient,
  createSupabaseAdminClient,
} from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { Flashcards, type Flashcard } from "@/components/Flashcards";
import { toDisplayWord } from "@/grading/pinyin.js";
import type { Assessment, Profile, Word, WordKey } from "@/lib/database.types";

export default async function FlashcardsPage({
  params,
}: {
  params: Promise<{ assessmentId: string }>;
}) {
  const { assessmentId } = await params;
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
  if (profile?.must_change_password) redirect("/account/password");

  const { data: assessment } = await supabase
    .from("assessments")
    .select("*")
    .eq("id", assessmentId)
    .single<Assessment>();
  if (!assessment) redirect("/student");

  // 접근: 연습 전용 / 교사 연습 허용 / 교사가 돌려준(반려) 학생
  let canStudy = assessment.mode === "practice" || assessment.allow_practice;
  if (!canStudy) {
    const { data: returned } = await supabase
      .from("submissions")
      .select("id")
      .eq("assessment_id", assessmentId)
      .eq("student_id", user.id)
      .not("returned_at", "is", null)
      .limit(1)
      .maybeSingle();
    canStudy = !!returned;
  }
  if (!canStudy) redirect("/student");

  // 정답키는 서버(admin)에서만 읽어 카드 구성(병음은 성조부호로 표기)
  const admin = createSupabaseAdminClient();
  const { data: words } = await admin
    .from("words")
    .select("*")
    .eq("assessment_id", assessmentId)
    .order("ord");
  const wordList = (words ?? []) as Word[];
  const { data: keys } = await admin
    .from("word_keys")
    .select("*")
    .in("word_id", wordList.map((w) => w.id));
  const keyByWord = new Map<string, WordKey>(
    ((keys ?? []) as WordKey[]).map((k) => [k.word_id, k]),
  );

  const cards: Flashcard[] = wordList.map((w) => {
    const k = keyByWord.get(w.id);
    return {
      wordId: w.id,
      hanzi: w.hanzi,
      pinyin: k?.correct_pinyin ? toDisplayWord(k.correct_pinyin, k.correct_tones) : "",
      meanings: k?.acceptable_meanings ?? [],
      exampleSentence: k?.example_sentence ?? null,
    };
  });

  return (
    <>
      <Topbar name={profile?.name || "학생"} role="student" home="/student" />
      <div className="container">
        <Link href="/student" className="muted">
          ← 내 평가
        </Link>
        <h1>플래시카드 · {assessment.title}</h1>
        <p className="muted">{assessment.unit} · 카드를 탭해 뒤집고, 발음도 들어보세요.</p>
        <Flashcards cards={cards} />
      </div>
    </>
  );
}
