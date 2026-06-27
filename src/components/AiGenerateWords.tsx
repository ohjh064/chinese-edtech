"use client";

import { useState } from "react";
import { generateWordsFromKorean, type WordInput } from "@/app/actions/teacher";
import type { SentenceTaskTypeDb } from "@/lib/database.types";

/**
 * 한국어 입력 → AI 문항 자동 생성 패널.
 * 생성 결과(WordInput[])를 onGenerated로 부모 폼에 전달한다(초안 — 교사 검토 후 저장).
 */
export function AiGenerateWords({
  hasKey,
  sentenceTaskType,
  onGenerated,
}: {
  hasKey: boolean;
  sentenceTaskType: SentenceTaskTypeDb;
  onGenerated: (words: WordInput[]) => void;
}) {
  const [mode, setMode] = useState<"list" | "topic">("list");
  const [text, setText] = useState("");
  const [count, setCount] = useState("8");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function handleGenerate() {
    setError(null);
    setNote(null);
    if (!text.trim()) {
      setError(mode === "list" ? "한국어 의미를 입력하세요." : "주제를 입력하세요.");
      return;
    }
    setBusy(true);
    try {
      const words = await generateWordsFromKorean({
        mode,
        text,
        count: mode === "topic" ? Number(count) || 8 : undefined,
        sentenceTaskType,
      });
      if (words.length === 0) {
        setError("생성된 단어가 없습니다. 입력을 바꿔 다시 시도하세요.");
      } else {
        onGenerated(words);
        setNote(`${words.length}개 생성됨 — 검토·수정 후 저장하세요.`);
        if (mode === "list") setText("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "생성 실패");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ background: "var(--primary-weak)" }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <b>AI 자동 생성 (한국어 → 한자·병음·예문·문항)</b>
        <div className="row" style={{ gap: 6 }}>
          <button
            type="button"
            className={mode === "list" ? "btn" : "btn secondary"}
            style={{ padding: "4px 10px", fontSize: 13 }}
            onClick={() => setMode("list")}
          >
            의미 목록
          </button>
          <button
            type="button"
            className={mode === "topic" ? "btn" : "btn secondary"}
            style={{ padding: "4px 10px", fontSize: 13 }}
            onClick={() => setMode("topic")}
          >
            주제·개수
          </button>
        </div>
      </div>

      {!hasKey ? (
        <p className="error" style={{ margin: "8px 0 0" }}>
          AI 생성에는 Anthropic API 키가 필요합니다.{" "}
          <a href="/teacher/settings">설정에서 키 입력</a>
        </p>
      ) : (
        <>
          {mode === "list" ? (
            <div className="field" style={{ margin: "8px 0 0" }}>
              <label>한국어 의미 — 한 줄에 하나</label>
              <textarea
                rows={4}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={"안녕\n감사\n학생"}
                disabled={busy}
              />
            </div>
          ) : (
            <div className="row" style={{ margin: "8px 0 0", alignItems: "flex-end" }}>
              <div className="field grow" style={{ marginBottom: 0 }}>
                <label>주제·단원(한국어)</label>
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="예: 음식 관련 어휘 / 1과 인사 표현"
                  disabled={busy}
                />
              </div>
              <div className="field" style={{ width: 90, marginBottom: 0 }}>
                <label>개수</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                  disabled={busy}
                />
              </div>
            </div>
          )}

          <div className="row" style={{ marginTop: 10, alignItems: "center" }}>
            <button type="button" className="btn" onClick={handleGenerate} disabled={busy}>
              {busy ? "생성 중…" : "AI로 생성"}
            </button>
            <span className="muted" style={{ fontSize: 12 }}>
              생성 결과는 초안입니다 — 특히 정답·예문을 검토·수정하세요.
            </span>
          </div>
          {note && <p className="ok" style={{ fontSize: 13, margin: "8px 0 0" }}>{note}</p>}
        </>
      )}
      {error && <p className="error" style={{ margin: "8px 0 0" }}>{error}</p>}
    </div>
  );
}
