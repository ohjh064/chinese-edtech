"use client";

import { useCallback, useEffect, useState } from "react";
import { SpeakButton } from "@/components/SpeakButton";
import { AddToWordbookButton } from "@/components/AddToWordbookButton";

export interface Flashcard {
  wordId: string;
  hanzi: string;
  pinyin: string; // 성조부호 표기
  meanings: string[];
  exampleSentence?: string | null;
}

function shuffled<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function Flashcards({ cards, allowSave = false }: { cards: Flashcard[]; allowSave?: boolean }) {
  const [deck, setDeck] = useState<Flashcard[]>(cards);
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [frontIsHanzi, setFrontIsHanzi] = useState(true);
  const [known, setKnown] = useState<Set<string>>(new Set());

  const cur = deck[pos];
  const atEnd = pos >= deck.length;

  const flip = useCallback(() => setFlipped((f) => !f), []);
  const next = useCallback(() => {
    setFlipped(false);
    setPos((p) => Math.min(p + 1, deck.length));
  }, [deck.length]);
  const prev = useCallback(() => {
    setFlipped(false);
    setPos((p) => Math.max(p - 1, 0));
  }, []);

  function reshuffle() {
    setDeck((d) => shuffled(d));
    setPos(0);
    setFlipped(false);
  }
  function markKnown() {
    if (cur) setKnown((k) => new Set(k).add(cur.wordId));
    next();
  }
  function reviewUnknown() {
    const rest = cards.filter((c) => !known.has(c.wordId));
    setDeck(rest.length ? rest : cards);
    setPos(0);
    setFlipped(false);
  }
  function restart() {
    setDeck(cards);
    setPos(0);
    setFlipped(false);
    setKnown(new Set());
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        flip();
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        next();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        prev();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flip, next, prev]);

  if (cards.length === 0) {
    return <div className="card muted">이 세트에는 학습할 단어가 없습니다.</div>;
  }

  if (atEnd || !cur) {
    return (
      <div className="card" style={{ textAlign: "center" }}>
        <b>학습 완료!</b>
        <p className="muted">아는 단어 {known.size} / {cards.length}</p>
        <div className="row" style={{ justifyContent: "center" }}>
          {known.size < cards.length && (
            <button className="btn" type="button" onClick={reviewUnknown}>
              모르는 것만 다시
            </button>
          )}
          <button className="btn secondary" type="button" onClick={restart}>
            처음부터
          </button>
        </div>
      </div>
    );
  }

  const meaningText = cur.meanings.filter(Boolean).join(", ") || "(뜻 없음)";

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <span className="muted">
          {pos + 1} / {deck.length} · 아는 단어 {known.size}
        </span>
        <div className="row" style={{ gap: 6 }}>
          {allowSave && (
            <AddToWordbookButton
              key={cur.wordId}
              item={{
                kind: "word",
                hanzi: cur.hanzi,
                pinyin: cur.pinyin,
                meaning: cur.meanings.join(", "),
                example: cur.exampleSentence,
                wordId: cur.wordId,
                source: "flashcard",
              }}
            />
          )}
          <button type="button" className="btn secondary" style={{ padding: "4px 10px", fontSize: 13 }} onClick={() => setFrontIsHanzi((v) => !v)}>
            {frontIsHanzi ? "한자 먼저" : "뜻 먼저"}
          </button>
          <button type="button" className="btn secondary" style={{ padding: "4px 10px", fontSize: 13 }} onClick={reshuffle}>
            섞기
          </button>
        </div>
      </div>

      <div
        className="card"
        onClick={flip}
        style={{
          minHeight: 220,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          cursor: "pointer",
          textAlign: "center",
        }}
      >
        {!flipped ? (
          frontIsHanzi ? (
            <>
              <div style={{ fontSize: 64, fontWeight: 700 }}>{cur.hanzi}</div>
              <SpeakButton hanzi={cur.hanzi} size="md" />
              <span className="muted" style={{ fontSize: 12 }}>탭하면 뜻·병음 보기</span>
            </>
          ) : (
            <>
              <div style={{ fontSize: 28, fontWeight: 600 }}>{meaningText}</div>
              <span className="muted" style={{ fontSize: 12 }}>탭하면 한자·병음 보기</span>
            </>
          )
        ) : frontIsHanzi ? (
          <>
            <div className="pill-preview" style={{ fontSize: 30, color: "var(--primary)" }}>{cur.pinyin}</div>
            <div style={{ fontSize: 22, fontWeight: 600 }}>{meaningText}</div>
            {cur.exampleSentence && <div className="muted" style={{ fontSize: 15 }}>{cur.exampleSentence}</div>}
            <SpeakButton hanzi={cur.hanzi} size="md" />
          </>
        ) : (
          <>
            <div style={{ fontSize: 56, fontWeight: 700 }}>{cur.hanzi}</div>
            <div className="pill-preview" style={{ fontSize: 26, color: "var(--primary)" }}>{cur.pinyin}</div>
            {cur.exampleSentence && <div className="muted" style={{ fontSize: 15 }}>{cur.exampleSentence}</div>}
            <SpeakButton hanzi={cur.hanzi} size="md" />
          </>
        )}
      </div>

      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <button type="button" className="btn secondary" onClick={prev} disabled={pos === 0}>
          ← 이전
        </button>
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn secondary" onClick={next}>모르겠어요</button>
          <button type="button" className="btn" onClick={markKnown}>알아요 ✓</button>
        </div>
        <button type="button" className="btn secondary" onClick={next}>
          다음 →
        </button>
      </div>
      <p className="muted" style={{ fontSize: 12, textAlign: "center" }}>
        키보드: Space/Enter 뒤집기 · ← → 이동
      </p>
    </div>
  );
}
