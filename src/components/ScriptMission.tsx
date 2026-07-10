"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SpeakButton } from "@/components/SpeakButton";
import { YuqiTutor } from "@/components/YuqiTutor";
import { startScriptMission, suggestSituation, gradeScript, type ScriptGradeResult } from "@/app/actions/script-mission";
import type { ScriptWordCard } from "@/lib/database.types";

/** 대본 미션: 무작위 단어를 모두 써서 상황 대본 작성 → AI 루브릭 채점(50점). */
export function ScriptMission({ assessmentId }: { assessmentId: string }) {
  const [loading, setLoading] = useState(true);
  const [situation, setSituation] = useState("");
  const [situationFixed, setSituationFixed] = useState(false);
  const [words, setWords] = useState<ScriptWordCard[]>([]);
  const [script, setScript] = useState("");
  const [grading, setGrading] = useState(false);
  const [rerolling, setRerolling] = useState(false);
  const [result, setResult] = useState<ScriptGradeResult | null>(null);
  const [round, setRound] = useState(0);
  const [tutorStarted, setTutorStarted] = useState(false);
  const [tutorVisible, setTutorVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleTutor() {
    if (!tutorStarted) {
      setTutorStarted(true);
      setTutorVisible(true);
    } else {
      setTutorVisible((v) => !v);
    }
  }

  async function reroll() {
    if (!words.length) return;
    setRerolling(true);
    setError(null);
    try {
      const s = await suggestSituation(assessmentId, words);
      setSituation(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : "상황을 받지 못했어요.");
    } finally {
      setRerolling(false);
    }
  }

  async function draw() {
    setLoading(true);
    setError(null);
    setResult(null);
    setScript("");
    setRound((n) => n + 1);
    setTutorStarted(false);
    setTutorVisible(false);
    try {
      const r = await startScriptMission(assessmentId);
      setSituation(r.situation);
      setSituationFixed(r.situationFixed);
      setWords(r.words);
    } catch (e) {
      setError(e instanceof Error ? e.message : "미션을 불러오지 못했어요.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function grade() {
    setGrading(true);
    setError(null);
    try {
      const r = await gradeScript({ assessmentId, situation, words, script });
      setResult(r);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "채점에 실패했어요.");
    } finally {
      setGrading(false);
    }
  }

  if (loading) return <div className="card muted">미션을 준비하고 있어요…</div>;

  return (
    <div>
      {result && (
        <div className="card" style={{ borderColor: "var(--primary)", textAlign: "center" }}>
          <div className="score-big">{result.total} / 50</div>
          <div className="row" style={{ justifyContent: "center", gap: 16, marginTop: 4 }}>
            <span><b>낱말 카드 활용</b> {result.usageScore} / 30</span>
            <span><b>간화자·병음 기재</b> {result.notationScore} / 20</span>
          </div>
          <p className="muted" style={{ fontSize: 13, margin: "8px 0 10px" }}>
            제시 단어 {result.usedCount} / {result.wordCount}개 활용 · 기재 오류 {result.notationErrorCount}개
          </p>
          <button type="button" className="btn" onClick={draw}>새 미션 받기</button>
        </div>
      )}

      {/* 상황(미션) — 교사 지정(고정) 또는 AI 배정/직접 설정 */}
      <div className="card" style={{ background: "var(--primary-weak)" }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <b>미션 상황{situationFixed && <span className="badge" style={{ marginLeft: 6 }}>선생님 지정</span>}</b>
          {!result && (
            <div className="row" style={{ gap: 6 }}>
              {!situationFixed && (
                <button type="button" className="btn secondary" style={{ padding: "4px 10px", fontSize: 13 }} onClick={reroll} disabled={rerolling}>
                  {rerolling ? "받는 중…" : "🎲 AI 상황 받기"}
                </button>
              )}
              <button type="button" className="btn secondary" style={{ padding: "4px 10px", fontSize: 13 }} onClick={draw}>단어 다시 뽑기</button>
            </div>
          )}
        </div>
        {result || situationFixed ? (
          <>
            <p style={{ margin: "6px 0 0" }}>{situation}</p>
            {situationFixed && !result && (
              <p className="muted" style={{ fontSize: 12, margin: "4px 0 0" }}>선생님이 정한 미션이에요. 이 상황에 맞는 대본을 작성하세요.</p>
            )}
          </>
        ) : (
          <>
            <textarea rows={2} value={situation} onChange={(e) => setSituation(e.target.value)} placeholder="상황을 직접 입력하거나 ‘AI 상황 받기’로 배정받으세요." style={{ marginTop: 6 }} />
            <p className="muted" style={{ fontSize: 12, margin: "4px 0 0" }}>상황을 직접 수정할 수 있어요. AI로 임의 배정도 가능합니다.</p>
          </>
        )}
      </div>

      {!result && (
        <Link href={`/student/script/${assessmentId}/practice`} className="card" style={{ display: "block", textDecoration: "none", color: "inherit", borderColor: "var(--primary)" }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <div>
              <b>🧩 표현 문장 배열 연습</b>
              <div className="muted" style={{ fontSize: 13 }}>대본에 필요한 표현을 단어 배열로 익히고, 어순 튜터의 도움을 받아보세요.</div>
            </div>
            <span className="btn secondary" style={{ whiteSpace: "nowrap" }}>연습하기 →</span>
          </div>
        </Link>
      )}

      {/* 제시 단어 카드 */}
      <div className="card">
        <b style={{ fontSize: 14 }}>이 단어를 모두 사용하세요</b>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 8, marginTop: 8 }}>
          {words.map((w, i) => {
            const pw = result?.perWord.find((p) => p.hanzi === w.hanzi);
            const border = pw
              ? pw.used
                ? pw.grammaticallyCorrect
                  ? "2px solid var(--ok)"
                  : "2px solid var(--warn)"
                : "2px solid var(--border)"
              : "1px solid var(--border)";
            return (
              <div key={i} style={{ border, borderRadius: 10, padding: "8px 10px", background: "#fff" }}>
                <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 20, fontWeight: 700 }}>{w.hanzi}</span>
                  <SpeakButton hanzi={w.hanzi} />
                </div>
                {w.pinyin && <div className="pill-preview muted" style={{ fontSize: 14 }}>{w.pinyin}</div>}
                {w.meaning && <div className="muted" style={{ fontSize: 13 }}>{w.meaning}</div>}
                {pw && (
                  <div style={{ fontSize: 12, marginTop: 4, color: pw.used ? (pw.grammaticallyCorrect ? "var(--ok)" : "var(--warn)") : "var(--muted)" }}>
                    {pw.used ? (pw.grammaticallyCorrect ? "✓ 사용·어법 OK" : "△ 사용·어법 오류") : "✗ 미사용"}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 대본 입력 + Yǔqí 튜터 */}
      {!result ? (
        <>
          <div className="card">
            <div className="field" style={{ marginBottom: 8 }}>
              <label>대본 작성</label>
              <p className="muted" style={{ fontSize: 12, margin: "0 0 6px" }}>
                간화자(간체)로 쓰고 한어병음도 함께 적으세요. 위 단어를 <b>모두</b> 사용하면 점수가 높아요.
              </p>
              <textarea rows={8} value={script} onChange={(e) => setScript(e.target.value)} placeholder="예) 你好！今天天气很好…（Nǐ hǎo! Jīntiān tiānqì hěn hǎo…）" />
            </div>
            {error && <p className="error">{error}</p>}
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span className="muted" style={{ fontSize: 12 }}>{script.trim().length}자</span>
              <div className="row" style={{ gap: 8 }}>
                <button type="button" className={`btn ${tutorStarted && tutorVisible ? "secondary" : ""}`} onClick={toggleTutor}>
                  {!tutorStarted ? "👩‍🏫 Yǔqí에게 도움받기" : tutorVisible ? "튜터 닫기" : "👩‍🏫 Yǔqí 다시 열기"}
                </button>
                <button type="button" className="btn" onClick={grade} disabled={grading || script.trim().length < 2}>{grading ? "채점 중…" : "채점하기"}</button>
              </div>
            </div>
          </div>
          {tutorStarted && (
            <div style={{ display: tutorVisible ? undefined : "none" }}>
              <YuqiTutor key={round} assessmentId={assessmentId} situation={situation} words={words} draft={script} />
            </div>
          )}
        </>
      ) : (
        <>
          <div className="card">
            <b style={{ fontSize: 14 }}>내 대본</b>
            <div style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>{script}</div>
          </div>
          <div className="card">
            <b style={{ fontSize: 14 }}>총평</b>
            <p style={{ margin: "6px 0 0" }}>{result.overall}</p>
            {result.notationIssues.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <span className="muted" style={{ fontSize: 13 }}>간화자·병음 지적</span>
                <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                  {result.notationIssues.map((s, i) => (
                    <li key={i} style={{ fontSize: 13 }}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
