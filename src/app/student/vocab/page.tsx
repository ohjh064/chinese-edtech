import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { WordbookView } from "@/components/WordbookView";
import { getWordbook } from "@/app/actions/wordbook";
import type { Profile } from "@/lib/database.types";

export default async function VocabPage() {
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

  const items = await getWordbook();

  return (
    <>
      <Topbar name={profile?.name || "학생"} role="student" home="/student" />
      <div className="container">
        <Link href="/student" className="muted">
          ← 내 평가
        </Link>
        <h1>내 단어장</h1>
        <p className="muted">플래시카드·단어학습·회화에서 담은 나의 약점 단어·표현을 모아 복습해요.</p>
        <WordbookView initial={items} />
      </div>
    </>
  );
}
