"use client";

import { useEffect, useRef, useState } from "react";
import { speakOnce, cancelSpeech } from "@/lib/tts";
import { getWordImage, logStudyAttempts } from "@/app/actions/study";
import { AddToWordbookButton } from "@/components/AddToWordbookButton";

export interface StudyCard {
  wordId: string;
  term: string;
  pinyin: string;
  pinyinRaw: string; // 성조 없는 로마자 병음(음절 공백 구분) — 딕테이션 철자용
  tones: number[]; // 음절별 성조(경성=0) — 딕테이션 성조용
  meanings: string[];
  example: string | null;
  imageUrl: string | null; // 교사가 붙인 이미지(있으면 자동검색보다 우선)
}

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function WordStudyStep1({ assessmentId, cards }: { assessmentId: string; cards: StudyCard[] }) {
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [done, setDone] = useState(false);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [imgLoading, setImgLoading] = useState(true);
  const runId = useRef(0);

  const total = cards.length;
  const card = cards[idx];

  // 단어 바뀔 때 이미지 로드: 교사가 붙인 이미지가 있으면 우선 사용, 없으면 자동검색(Openverse) 폴백
  useEffect(() => {
    if (!card) return;
    let cancelled = false;
    if (card.imageUrl) {
      setImgUrl(card.imageUrl);
      setImgLoading(false);
      return;
    }
    setImgUrl(null);
    setImgLoading(true);
    getWordImage(card.term)
      .then((u) => { if (!cancelled) { setImgUrl(u); setImgLoading(false); } })
      .catch(() => { if (!cancelled) setImgLoading(false); });
    return () => { cancelled = true; };
  }, [card?.term, card?.imageUrl]);

  // 자동 재생: 발음 2회 → 짧은 지연 후 다음 단어
  useEffect(() => {
    if (!playing || done || !card) return;
    const myRun = ++runId.current;
    const alive = () => myRun === runId.current;
    (async () => {
      await speakOnce(card.term);
      if (!alive()) return;
      await wait(250);
      if (!alive()) return;
      await speakOnce(card.term);
      if (!alive()) return;
      await wait(800);
      if (!alive()) return;
      if (idx + 1 < total) setIdx(idx + 1);
      else {
        setDone(true);
        setPlaying(false);
        // 한 바퀴 완료 → 들은 단어들을 학습 기록(교사 추적용, 정오답 없음)
        void logStudyAttempts(assessmentId, 1, cards.map((c) => ({ wordId: c.wordId, correct: null })));
      }
    })();
    return () => { runId.current++; cancelSpeech(); };
  }, [idx, playing, done, card?.term, total]);

  useEffect(() => () => cancelSpeech(), []);

  function goPrev() { cancelSpeech(); setDone(false); setIdx((i) => Math.max(0, i - 1)); }
  function goNext() { cancelSpeech(); setDone(false); setIdx((i) => Math.min(total - 1, i + 1)); }
  function replay() { if (card) void speakOnce(card.term); }
  function togglePlay() { setPlaying((p) => { if (p) cancelSpeech(); return !p; }); }
  function restart() { cancelSpeech(); setIdx(0); setDone(false); setPlaying(true); }

  if (!card) return <div className="card muted">학습할 단어가 없습니다.</div>;

  if (done) {
    return (
      <div className="card" style={{ textAlign: "center" }}>
        <b>{total}단어 학습 완료!</b>
        <p className="muted" style={{ fontSize: 13 }}>발음을 들으며 한 바퀴 돌았어요.</p>
        <button className="btn" type="button" onClick={restart}>처음부터 다시</button>
      </div>
    );
  }

  return (
    <div>
      <div className="card row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <span className="badge">1단계 · 듣기</span>
        <span className="muted" style={{ fontSize: 13 }}>{idx + 1} / {total}</span>
      </div>

      <div className="card" style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", minHeight: 220 }}>
        <div
          style={{
            width: 220, height: 165, flexShrink: 0, borderRadius: 12, overflow: "hidden",
            background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          {imgUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imgUrl} alt={card.term} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <span style={{ fontSize: imgLoading ? 16 : 48, fontWeight: 700, color: imgLoading ? "var(--muted, #94a3b8)" : "var(--text)" }}>
              {imgLoading ? "이미지…" : card.term}
            </span>
          )}
        </div>
        <div className="grow" style={{ minWidth: 200 }}>
          <div style={{ fontSize: 40, fontWeight: 800, lineHeight: 1.1 }}>{card.term}</div>
          {card.pinyin && <div className="muted" style={{ fontSize: 20, marginTop: 2 }}>{card.pinyin}</div>}
          {card.meanings.length > 0 && (
            <div style={{ fontSize: 20, marginTop: 8 }}>{card.meanings.join(", ")}</div>
          )}
          {card.example && <div className="muted" style={{ fontSize: 15, marginTop: 8 }}>{card.example}</div>}
        </div>
      </div>

      <div className="card row" style={{ justifyContent: "center", gap: 10, alignItems: "center" }}>
        <button className="btn secondary" type="button" onClick={goPrev} disabled={idx === 0}>← 이전</button>
        <button className="btn" type="button" onClick={togglePlay}>{playing ? "⏸ 일시정지" : "▶ 자동재생"}</button>
        <button className="btn secondary" type="button" onClick={replay}>🔊 다시듣기</button>
        <button className="btn secondary" type="button" onClick={goNext} disabled={idx >= total - 1}>다음 →</button>
        <AddToWordbookButton
          key={card.wordId}
          item={{
            kind: "word",
            hanzi: card.term,
            pinyin: card.pinyin,
            meaning: card.meanings.join(", "),
            example: card.example,
            wordId: card.wordId,
            source: "study",
          }}
        />
      </div>
      <p className="muted" style={{ fontSize: 12, textAlign: "center" }}>
        발음이 2번 나온 뒤 다음 단어로 자동으로 넘어갑니다. (소리가 안 나오면 ‘자동재생’을 한 번 눌러주세요)
      </p>
    </div>
  );
}
