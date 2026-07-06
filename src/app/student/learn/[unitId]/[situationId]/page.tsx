import Link from "next/link";
import { redirect } from "next/navigation";
import {
  createSupabaseServerClient,
  createSupabaseAdminClient,
} from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { SpeakButton } from "@/components/SpeakButton";
import { AddToWordbookButton } from "@/components/AddToWordbookButton";
import type {
  Expression,
  LevelProgress,
  Profile,
  Situation,
  Unit,
} from "@/lib/database.types";

export default async function LearnSituationPage({
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

  const { data: unit } = await supabase
    .from("units")
    .select("*")
    .eq("id", unitId)
    .single<Unit>();
  if (!unit) redirect("/student/learn");
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
  const exprList = (exprs ?? []) as Expression[];

  // 진척(본인) + 보스 미션 존재 여부(학생 read) + 문장 문제 수(admin)
  const { data: progRows } = await supabase
    .from("level_progress")
    .select("activity, cleared")
    .eq("student_id", user.id)
    .eq("situation_id", situationId);
  const cleared = new Set(
    ((progRows ?? []) as Pick<LevelProgress, "activity" | "cleared">[])
      .filter((p) => p.cleared)
      .map((p) => p.activity),
  );
  const { data: boss } = await supabase
    .from("boss_missions")
    .select("id")
    .eq("situation_id", situationId)
    .maybeSingle<{ id: string }>();
  const admin = createSupabaseAdminClient();
  const { count: builderCount } = await admin
    .from("sentence_items")
    .select("id", { count: "exact", head: true })
    .eq("situation_id", situationId);

  const base = `/student/learn/${unitId}/${situationId}`;

  return (
    <>
      <Topbar name={profile?.name || "학생"} role="student" home="/student" />
      <div className="container">
        <Link href={`/student/learn/${unitId}`} className="muted">
          ← {unit.title}
        </Link>
        <h1>{situation.title}</h1>
        {situation.description && <p className="muted">{situation.description}</p>}
        {(situation.role_student || situation.role_ai) && (
          <p className="muted" style={{ fontSize: 14 }}>
            역할 — 나: {situation.role_student || "—"} · AI: {situation.role_ai || "—"}
          </p>
        )}

        <h2>핵심 표현</h2>
        {exprList.length === 0 && <div className="card muted">표현이 아직 없습니다.</div>}
        {exprList.map((e) => (
          <div className="card" key={e.id}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <span style={{ fontSize: 22, fontWeight: 700 }}>{e.hanzi}</span>
                {e.pinyin && <span className="pill-preview muted" style={{ marginLeft: 10 }}>{e.pinyin}</span>}
                {e.meaning && <div className="muted" style={{ fontSize: 14 }}>{e.meaning}</div>}
              </div>
              <div className="row" style={{ gap: 6, alignItems: "center" }}>
                <SpeakButton hanzi={e.hanzi} />
                <AddToWordbookButton
                  item={{
                    kind: "expression",
                    hanzi: e.hanzi,
                    pinyin: e.pinyin,
                    meaning: e.meaning,
                    situationId: e.situation_id,
                    source: "expression",
                  }}
                />
              </div>
            </div>
          </div>
        ))}

        <h2>학습 코스</h2>
        {(builderCount ?? 0) > 0 && (
          <ActivityCard
            title="문장 배열 (Sentence Builder)"
            desc="단어를 순서대로 배열해 문장을 완성"
            href={`${base}/builder`}
            done={cleared.has("builder")}
          />
        )}
        <ActivityCard
          title="롤플레이 대화"
          desc="AI와 역할극 대화 + 1:1 코칭"
          href={`${base}/roleplay`}
          done={cleared.has("roleplay")}
        />
        <ActivityCard
          title="AI 듀얼 롤플레이"
          desc="AI가 두 역할을 시연 · 원하면 끼어들기"
          href={`${base}/dual`}
          done={cleared.has("dual")}
        />
        <ActivityCard
          title="성조 발음 코칭"
          desc="마이크로 성조 윤곽을 근사 분석(참고용)"
          href={`${base}/tone`}
          done={cleared.has("tone")}
        />
        {boss && (
          <ActivityCard
            title="Boss Mission"
            desc="힌트 없이 실전 미션 수행 + 평가"
            href={`${base}/boss`}
            done={cleared.has("boss")}
          />
        )}
      </div>
    </>
  );
}

function ActivityCard({
  title,
  desc,
  href,
  done,
}: {
  title: string;
  desc: string;
  href: string;
  done: boolean;
}) {
  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>
            {title} {done && <span className="ok" style={{ fontSize: 14 }}>✓ 완료</span>}
          </div>
          <div className="muted" style={{ fontSize: 13 }}>{desc}</div>
        </div>
        <Link className="btn" href={href}>{done ? "다시" : "시작"}</Link>
      </div>
    </div>
  );
}
