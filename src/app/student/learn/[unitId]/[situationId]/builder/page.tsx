import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { SentenceBuilder } from "@/components/SentenceBuilder";
import { getSentenceBuilder, gradeSentence, sentenceHint, askBuilderTutor } from "@/app/actions/sentence-builder";
import type { Profile, Situation } from "@/lib/database.types";

export default async function BuilderPage({
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
  if (profile?.must_change_password) redirect("/account/password");

  const { data: situation } = await supabase
    .from("situations")
    .select("*")
    .eq("id", situationId)
    .single<Situation>();
  if (!situation) redirect(`/student/learn/${unitId}`);

  const items = await getSentenceBuilder(situationId);

  return (
    <>
      <Topbar name={profile?.name || "학생"} role="student" home="/student" />
      <div className="container">
        <Link href={`/student/learn/${unitId}/${situationId}`} className="muted">
          ← {situation.title}
        </Link>
        <h1>문장 배열 · {situation.title}</h1>
        <p className="muted">단어 타일을 순서대로 배열해 문장을 완성하세요. 어순이 헷갈리면 ‘어순 튜터’에게 물어보세요.</p>
        <SentenceBuilder items={items} onGrade={gradeSentence} onHint={sentenceHint} tutorAsk={askBuilderTutor} />
      </div>
    </>
  );
}
