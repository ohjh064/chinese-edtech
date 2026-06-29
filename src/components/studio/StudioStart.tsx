"use client";

import { useState } from "react";
import { createUnit, seedUnitsFromTemplates } from "@/app/actions/studio";

function isRedirect(e: unknown) {
  return !!e && typeof e === "object" && "digest" in e;
}

export function StudioStart({ hasUnits }: { hasUnits: boolean }) {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setBusy(true);
    setError(null);
    try {
      await createUnit(title);
    } catch (e) {
      if (isRedirect(e)) return;
      setError(e instanceof Error ? e.message : "생성 실패");
      setBusy(false);
    }
  }
  async function seed() {
    setBusy(true);
    setError(null);
    try {
      await seedUnitsFromTemplates();
    } catch (e) {
      setError(e instanceof Error ? e.message : "불러오기 실패");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="row" style={{ alignItems: "flex-end" }}>
        <div className="field grow" style={{ marginBottom: 0 }}>
          <label>새 단원 제목</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 你好！" />
        </div>
        <button className="btn" type="button" onClick={add} disabled={busy}>
          + 새 단원
        </button>
        {!hasUnits && (
          <button className="btn secondary" type="button" onClick={seed} disabled={busy}>
            교과서 8단원 불러오기
          </button>
        )}
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
