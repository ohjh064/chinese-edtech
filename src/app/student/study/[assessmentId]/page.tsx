import Link from "next/link";
import { redirect } from "next/navigation";
import {
  createSupabaseServerClient,
  createSupabaseAdminClient,
} from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { StudySteps } from "@/components/StudySteps";
import type { StudyCard } from "@/components/WordStudyStep1";
import { toDisplayWord } from "@/grading/pinyin.js";
import type { Assessment, Profile, Word, WordKey } from "@/lib/database.types";

export default async function StudyPage({
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
  if (profile?.role === "teacher") redirect("/teacher");
  if (profile?.must_change_password) redirect("/account/password");

  // RLS로 접근 가능한(공개+배부/반) 평가만 조회됨
  const { data: assessment } = await supabase
    .from("assessments")
    .select("*")
    .eq("id", assessmentId)
    .single<Assessment>();
  if (!assessment) redirect("/student");

  // 학습 허용: 연습 모드 / 연습 허용 / 교사 반려
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

  // 표시 데이터는 서버(admin)에서 로드(word_keys는 학생 RLS 접근 불가)
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
  const keyByWord = new Map<string, WordKey>(((keys ?? []) as WordKey[]).map((k) => [k.word_id, k]));

  const cards: StudyCard[] = wordList.map((w) => {
    const k = keyByWord.get(w.id);
    return {
      wordId: w.id,
      term: w.hanzi,
      pinyin: k?.correct_pinyin ? toDisplayWord(k.correct_pinyin, k.correct_tones) : "",
      pinyinRaw: k?.correct_pinyin ?? "",
      tones: k?.correct_tones ?? [],
      meanings: k?.acceptable_meanings ?? [],
      example: k?.example_sentence ?? null,
      imageUrl: w.image_url ?? null,
    };
  });

  return (
    <>
      <Topbar name={profile?.name || "학생"} role="student" home="/student" />
      <div className="container">
        <Link href="/student" className="muted">← 내 학습</Link>
        <h1>{assessment.title}</h1>
        <p className="muted">1단계는 들으며 익히고, 2단계는 단어와 뜻을 짝지어 맞춰요. 3단계는 발음을 듣고 병음과 성조를 받아쓰고, 4단계는 빠르게 뜻·병음·성조를 맞히고, 5단계는 뜻을 보고 병음과 성조를 직접 써요.</p>
        {cards.length === 0 ? (
          <div className="card muted">아직 단어가 없습니다.</div>
        ) : (
          <StudySteps assessmentId={assessmentId} title={assessment.title} cards={cards} />
        )}
      </div>
    </>
  );
}
