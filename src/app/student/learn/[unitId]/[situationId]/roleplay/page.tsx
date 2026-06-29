import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { RolePlayChat } from "@/components/RolePlayChat";
import { startConversation } from "@/app/actions/roleplay";
import type { Profile, Situation } from "@/lib/database.types";

export default async function RolePlayPage({
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

  // RLS: 열람 가능한 상황만
  const { data: situation } = await supabase
    .from("situations")
    .select("*")
    .eq("id", situationId)
    .single<Situation>();
  if (!situation) redirect(`/student/learn/${unitId}`);

  const start = await startConversation(situationId);

  return (
    <>
      <Topbar name={profile?.name || "학생"} role="student" home="/student" />
      <div className="container">
        <Link href={`/student/learn/${unitId}/${situationId}`} className="muted">
          ← {situation.title}
        </Link>
        <h1>{situation.title} · 대화</h1>
        {(situation.role_student || situation.role_ai) && (
          <p className="muted" style={{ fontSize: 14 }}>
            나: {situation.role_student || "학습자"} · AI: {situation.role_ai || "대화 상대"}
          </p>
        )}
        <RolePlayChat
          conversationId={start.conversationId}
          initialHistory={start.history}
          initialTurnsLeft={start.turnsLeft}
          initialDone={start.done}
        />
      </div>
    </>
  );
}
