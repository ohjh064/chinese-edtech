import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { DualRolePlay } from "@/components/DualRolePlay";
import { startDual } from "@/app/actions/dual";
import type { Profile, Situation } from "@/lib/database.types";

export default async function DualPage({
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

  const start = await startDual(situationId);

  return (
    <>
      <Topbar name={profile?.name || "학생"} role="student" home="/student" />
      <div className="container">
        <Link href={`/student/learn/${unitId}/${situationId}`} className="muted">
          ← {situation.title}
        </Link>
        <h1>듀얼 롤플레이 · {situation.title}</h1>
        <DualRolePlay
          conversationId={start.conversationId}
          roleA={start.roleA}
          roleB={start.roleB}
          initialHistory={start.history}
          initialTurnsLeft={start.turnsLeft}
          initialDone={start.done}
        />
      </div>
    </>
  );
}
