import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { TonePractice, type ToneTarget } from "@/components/TonePractice";
import { pinyinToTones } from "@/lib/tone";
import type { Expression, Profile, Situation } from "@/lib/database.types";

export default async function TonePage({
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
  if (profile?.role === "teacher") redirect("/teacher");
  if (profile?.must_change_password) redirect("/account/password");

  const { data: situation } = await supabase
    .from("situations")
    .select("*")
    .eq("id", situationId)
    .single<Situation>();
  if (!situation) redirect(`/student/learn/${unitId}`);

  const { data: exprs } = await supabase
    .from("expressions")
    .select("*")
    .eq("situation_id", situationId)
    .order("ord");

  // 병음에서 성조를 추출하고, 음절 수와 한자 수가 맞는 표현만 연습 대상으로
  const targets: ToneTarget[] = ((exprs ?? []) as Expression[])
    .filter((e) => e.pinyin)
    .map((e) => ({ hanzi: e.hanzi, pinyin: e.pinyin as string, tones: pinyinToTones(e.pinyin as string) }))
    .filter((t) => t.tones.length > 0 && t.tones.length === [...t.hanzi].length);

  return (
    <>
      <Topbar name={profile?.name || "학생"} role="student" home="/student" />
      <div className="container">
        <Link href={`/student/learn/${unitId}/${situationId}`} className="muted">
          ← {situation.title}
        </Link>
        <h1>성조 발음 코칭 · {situation.title}</h1>
        {targets.length === 0 ? (
          <div className="card muted">
            성조를 분석할 표현이 없습니다. (표현의 병음에 성조 표기가 필요해요.)
          </div>
        ) : (
          <TonePractice targets={targets} />
        )}
      </div>
    </>
  );
}
