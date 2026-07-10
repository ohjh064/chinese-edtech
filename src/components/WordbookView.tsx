"use client";

import { useMemo, useState } from "react";
import { SpeakButton } from "@/components/SpeakButton";
import { Flashcards, type Flashcard } from "@/components/Flashcards";
import { removeFromWordbook } from "@/app/actions/wordbook";
import type { WordbookItem, WordbookKind } from "@/lib/database.types";

type Filter = "all" | WordbookKind;

const SOURCE_LABEL: Record<string, string> = {
  flashcard: "플래시카드",
  study: "단어학습",
  expression: "회화 표현",
  exam: "시험지",
  manual: "직접",
};

export function WordbookView({ initial }: { initial: WordbookItem[] }) {
  const [items, setItems] = useState<WordbookItem[]>(initial);
  const [filter, setFilter] = useState<Filter>("all");
  const [review, setReview] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const shown = useMemo(
    () => (filter === "all" ? items : items.filter((i) => i.kind === filter)),
    [items, filter],
  );

  const wordCount = items.filter((i) => i.kind === "word").length;
  const exprCount = items.filter((i) => i.kind === "expression").length;

  async function remove(id: string) {
    setBusyId(id);
    try {
      await removeFromWordbook(id);
      setItems((xs) => xs.filter((x) => x.id !== id));
    } catch {
      /* 무시 */
    } finally {
      setBusyId(null);
    }
  }

  const reviewCards: Flashcard[] = shown.map((i) => ({
    wordId: i.id,
    hanzi: i.hanzi,
    pinyin: i.pinyin ?? "",
    meanings: i.meaning ? [i.meaning] : [],
    exampleSentence: i.example,
  }));

  const TABS: { key: Filter; label: string }[] = [
    { key: "all", label: `전체 ${items.length}` },
    { key: "word", label: `단어 ${wordCount}` },
    { key: "expression", label: `표현 ${exprCount}` },
  ];

  if (items.length === 0) {
    return (
      <div className="card muted">
        아직 담은 단어·표현이 없어요. 플래시카드·단어학습 1단계나 회화 “핵심 표현”에서 <b>＋ 내 단어장</b>으로 담아보세요.
      </div>
    );
  }

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div className="row" style={{ gap: 6 }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`btn ${filter === t.key ? "" : "secondary"}`}
              style={{ padding: "4px 10px", fontSize: 13 }}
              onClick={() => setFilter(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={`btn ${review ? "" : "secondary"}`}
          onClick={() => setReview((v) => !v)}
          disabled={shown.length === 0}
        >
          {review ? "목록 보기" : "플래시카드로 복습"}
        </button>
      </div>

      {review ? (
        <div style={{ marginTop: 12 }}>
          {reviewCards.length > 0 ? (
            <Flashcards cards={reviewCards} />
          ) : (
            <div className="card muted">복습할 항목이 없어요.</div>
          )}
        </div>
      ) : (
        <div style={{ marginTop: 12 }}>
          {shown.length === 0 && <div className="card muted">이 분류에는 담은 항목이 없어요.</div>}
          {shown.map((i) => (
            <div className="card" key={i.id}>
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontSize: 22, fontWeight: 700 }}>{i.hanzi}</span>
                    {i.pinyin && <span className="pill-preview muted">{i.pinyin}</span>}
                    <span className="badge">{i.kind === "expression" ? "표현" : "단어"}</span>
                    {i.source && SOURCE_LABEL[i.source] && (
                      <span className="muted" style={{ fontSize: 12 }}>· {SOURCE_LABEL[i.source]}</span>
                    )}
                  </div>
                  {i.meaning && <div style={{ fontSize: 15, marginTop: 2 }}>{i.meaning}</div>}
                  {i.example && <div className="muted" style={{ fontSize: 14, marginTop: 2 }}>{i.example}</div>}
                </div>
                <div className="row" style={{ gap: 6, alignItems: "center", flexShrink: 0 }}>
                  <SpeakButton hanzi={i.hanzi} />
                  <button
                    type="button"
                    className="btn secondary"
                    style={{ padding: "4px 10px", fontSize: 13 }}
                    onClick={() => remove(i.id)}
                    disabled={busyId === i.id}
                  >
                    {busyId === i.id ? "삭제 중…" : "삭제"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
