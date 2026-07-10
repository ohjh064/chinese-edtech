"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  addToWordbook,
  lookupWordForWordbook,
  type WordbookLookup,
} from "@/app/actions/wordbook";
import type { WordbookKind } from "@/lib/database.types";

/** 한자 1자라도 포함하는지(선택 조각 필터용). */
const HAS_CJK = /[㐀-䶿一-鿿豈-﫿]/;

/**
 * 자식 영역에서 중국어 텍스트를 드래그하면 "＋ 단어장" 칩이 뜨고,
 * 누르면 병음·뜻이 자동 채워진 편집 팝업에서 내 단어장에 저장한다.
 * 시험지 풀이(QbankSolve) 등 학생이 중국어를 읽는 화면을 감싸 사용.
 */
export function WordClipper({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [chip, setChip] = useState<{ text: string; top: number; left: number } | null>(null);
  const [editing, setEditing] = useState<string | null>(null); // 편집 중인 원본 조각

  const readSelection = useCallback(() => {
    if (editing) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      setChip(null);
      return;
    }
    const range = sel.getRangeAt(0);
    const container = ref.current;
    if (!container || !container.contains(range.commonAncestorContainer)) {
      setChip(null);
      return;
    }
    const text = sel.toString();
    if (!HAS_CJK.test(text)) {
      setChip(null);
      return;
    }
    const rect = range.getBoundingClientRect();
    if (!rect.width && !rect.height) {
      setChip(null);
      return;
    }
    setChip({ text, top: rect.top, left: rect.left + rect.width / 2 });
  }, [editing]);

  useEffect(() => {
    const onUp = () => window.setTimeout(readSelection, 0);
    const onScroll = () => setChip(null);
    document.addEventListener("mouseup", onUp);
    document.addEventListener("touchend", onUp);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("touchend", onUp);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [readSelection]);

  function openEditor() {
    if (!chip) return;
    setEditing(chip.text);
    setChip(null);
    window.getSelection()?.removeAllRanges();
  }

  const above = chip ? chip.top > 56 : true;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {children}

      {chip && (
        <button
          type="button"
          // 클릭이 선택을 해제하지 않도록 mousedown 기본동작 차단
          onMouseDown={(e) => e.preventDefault()}
          onClick={openEditor}
          style={{
            position: "fixed",
            top: above ? chip.top - 44 : chip.top + 24,
            left: chip.left,
            transform: "translateX(-50%)",
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "7px 12px",
            borderRadius: 999,
            border: "none",
            background: "var(--primary, #2563eb)",
            color: "#fff",
            fontSize: 13,
            fontWeight: 700,
            whiteSpace: "nowrap",
            cursor: "pointer",
            boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
          }}
        >
          ＋ 단어장에 추가
        </button>
      )}

      {editing !== null && (
        <WordEditor key={editing} raw={editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function WordEditor({ raw, onClose }: { raw: string; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [hanzi, setHanzi] = useState("");
  const [pinyin, setPinyin] = useState("");
  const [meaning, setMeaning] = useState("");
  const [kind, setKind] = useState<WordbookKind>("word");
  const [state, setState] = useState<"idle" | "saving" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    lookupWordForWordbook(raw)
      .then((r: WordbookLookup) => {
        if (!alive) return;
        setHanzi(r.hanzi);
        setPinyin(r.pinyin);
        setMeaning(r.meaning);
        setKind(r.kind);
      })
      .catch(() => alive && setError("자동 채우기에 실패했어요. 직접 입력해도 저장돼요."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [raw]);

  async function save() {
    if (state === "saving" || !hanzi.trim()) return;
    setState("saving");
    setError(null);
    try {
      await addToWordbook({
        kind,
        hanzi: hanzi.trim(),
        pinyin: pinyin.trim() || null,
        meaning: meaning.trim() || null,
        source: "exam",
      });
      setState("done");
      window.setTimeout(onClose, 900);
    } catch (e) {
      setState("idle");
      setError(e instanceof Error ? e.message : "저장 실패");
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card"
        style={{ width: "min(420px, 100%)", background: "#fff", margin: 0 }}
      >
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <b>내 단어장에 추가</b>
          <button
            type="button"
            className="btn secondary"
            style={{ padding: "4px 10px", fontSize: 13 }}
            onClick={onClose}
          >
            닫기
          </button>
        </div>

        {loading ? (
          <p className="muted" style={{ margin: "12px 0" }}>병음·뜻 불러오는 중…</p>
        ) : (
          <>
            <div className="field" style={{ margin: "10px 0 0" }}>
              <label>한자</label>
              <input value={hanzi} onChange={(e) => setHanzi(e.target.value)} style={{ fontSize: 20 }} />
            </div>
            <div className="field" style={{ margin: "10px 0 0" }}>
              <label>한어병음</label>
              <input value={pinyin} onChange={(e) => setPinyin(e.target.value)} placeholder="예: duō shǎo qián" />
            </div>
            <div className="field" style={{ margin: "10px 0 0" }}>
              <label>뜻</label>
              <input value={meaning} onChange={(e) => setMeaning(e.target.value)} placeholder="한국어 뜻" />
            </div>
            <div className="row" style={{ margin: "10px 0 0", gap: 6, alignItems: "center" }}>
              <span className="muted" style={{ fontSize: 13 }}>분류</span>
              {(["word", "expression"] as WordbookKind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  className={`btn ${kind === k ? "" : "secondary"}`}
                  style={{ padding: "4px 10px", fontSize: 13 }}
                  onClick={() => setKind(k)}
                >
                  {k === "word" ? "단어" : "표현"}
                </button>
              ))}
            </div>
          </>
        )}

        {error && <p className="error" style={{ margin: "10px 0 0", fontSize: 13 }}>{error}</p>}

        <div className="row" style={{ marginTop: 14, justifyContent: "flex-end" }}>
          <button
            type="button"
            className="btn"
            onClick={save}
            disabled={loading || state !== "idle" || !hanzi.trim()}
          >
            {state === "done" ? "담김 ✓" : state === "saving" ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
