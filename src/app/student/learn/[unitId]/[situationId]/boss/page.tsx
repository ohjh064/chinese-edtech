import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { RolePlayChat } from "@/components/RolePlayChat";
import { startConversation } from "@/app/actions/roleplay";
import type { Profile, Situation } from "@/lib/database.types";

export default async function BossPage({
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

  const { data: boss } = await supabase
    .from("boss_missions")
    .select("description, steps")
    .eq("situation_id", situationId)
    .maybeSingle<{ description: string | null; steps: string[] }>();

  const start = await startConversation(situationId, "boss");

  return (
    <>
      <Topbar name={profile?.name || "학생"} role="student" home="/student" />
      <div className="container">
        <Link href={`/student/learn/${unitId}/${situationId}`} className="muted">
          ← {situation.title}
        </Link>
        <h1>Boss Mission · {situation.title}</h1>
        <RolePlayChat
          conversationId={start.conversationId}
          initialHistory={start.history}
          initialTurnsLeft={start.turnsLeft}
          initialDone={start.done}
          boss={{ description: boss?.description ?? null, steps: boss?.steps ?? [] }}
        />
      </div>
    </>
  );
}
