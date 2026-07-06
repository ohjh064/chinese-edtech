"use client";

import { useEffect, useRef, useState } from "react";
import { searchWordImages, type ImageResult } from "@/app/actions/word-images";

/**
 * 단어 이미지 선택 모달 — 온라인 검색(Openverse) + PC 업로드.
 * 부모가 pickerIndex 상태로 단일 인스턴스를 구동한다. onPick(url)로 현재 단어에 이미지 지정,
 * "다음 단어 →"(onNext)로 닫지 않고 다음 행으로 이동해 연속 지정.
 */
export function WordImagePicker({
  open,
  wordLabel,
  initialQuery,
  currentUrl,
  hasNext,
  onPick,
  onNext,
  onClose,
}: {
  open: boolean;
  wordLabel: string; // 헤더에 표시할 현재 단어(한자/뜻)
  initialQuery: string;
  currentUrl: string; // 현재 이 단어에 지정된 이미지(있으면 하이라이트)
  hasNext: boolean;
  onPick: (url: string) => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<ImageResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function runSearch(q: string) {
    const term = q.trim();
    if (!term) {
      setResults([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const items = await searchWordImages(term);
      setResults(items);
      if (!items.length) setError("검색 결과가 없어요. 다른 검색어(영어 뜻 등)로 시도해 보세요.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "검색 실패");
    } finally {
      setLoading(false);
    }
  }

  // 열리거나 대상 단어가 바뀌면 검색어를 프리필하고 자동 검색
  useEffect(() => {
    if (!open) return;
    setQuery(initialQuery);
    setError(null);
    void runSearch(initialQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialQuery]);

  async function onUpload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/wordimage/upload", { method: "POST", body: fd });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) throw new Error(json.error || "업로드 실패");
      onPick(json.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "업로드 실패");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff", width: "100%", maxWidth: 720, maxHeight: "88vh",
          borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column",
          boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
        }}
      >
        {/* 헤더 */}
        <div
          style={{
            background: "var(--primary, #22c55e)", color: "#fff", padding: "12px 16px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}
        >
          <b style={{ fontSize: 16 }}>이미지 검색{wordLabel ? ` · ${wordLabel}` : ""}</b>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            style={{ background: "transparent", border: "none", color: "#fff", fontSize: 22, cursor: "pointer", lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        {/* 검색 바 */}
        <div className="row" style={{ gap: 8, padding: "12px 16px", alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void runSearch(query); } }}
            placeholder="검색어 (예: come, 사과, apple)"
            style={{ flex: 1, minWidth: 160 }}
          />
          <button type="button" className="btn" onClick={() => void runSearch(query)} disabled={loading}>
            {loading ? "검색 중…" : "🔍 검색"}
          </button>
          {hasNext && (
            <button type="button" className="btn secondary" onClick={onNext} title="다음 단어로 이동(모달 유지)">
              다음 단어 →
            </button>
          )}
        </div>

        {error && <p className="error" style={{ margin: "0 16px" }}>{error}</p>}

        {/* 그리드: 첫 칸 PC 업로드 + 검색 결과 썸네일 */}
        <div style={{ overflowY: "auto", padding: 16, paddingTop: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 10 }}>
            {/* PC 업로드 타일 */}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              style={{
                aspectRatio: "4 / 3", border: "2px dashed var(--primary, #22c55e)", borderRadius: 10,
                background: "#f7fef9", color: "var(--primary, #16a34a)", cursor: "pointer",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, fontWeight: 600,
              }}
            >
              <span style={{ fontSize: 22 }}>📁</span>
              {uploading ? "업로드 중…" : "PC에서 업로드"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void onUpload(f); }}
            />

            {results.map((r, i) => {
              const selected = currentUrl && (r.url === currentUrl || r.thumbnail === currentUrl);
              return (
                <button
                  key={`${r.thumbnail}-${i}`}
                  type="button"
                  onClick={() => onPick(r.url || r.thumbnail)}
                  title="이 이미지로 지정"
                  style={{
                    aspectRatio: "4 / 3", borderRadius: 10, overflow: "hidden", cursor: "pointer", padding: 0,
                    border: selected ? "3px solid var(--primary, #22c55e)" : "1px solid var(--border, #e2e8f0)",
                    background: "#f1f5f9",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.thumbnail} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </button>
              );
            })}
          </div>
          {loading && <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>이미지를 불러오는 중…</p>}
        </div>

        {/* 푸터 */}
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", padding: "10px 16px", borderTop: "1px solid var(--border, #e2e8f0)" }}>
          <span className="muted" style={{ fontSize: 12 }}>
            {currentUrl ? "이 단어에 이미지가 지정되어 있어요." : "이미지를 클릭하면 이 단어에 지정됩니다."}
          </span>
          <button type="button" className="btn secondary" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  );
}
