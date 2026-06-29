"use client";

import { useState } from "react";
import { createSituation } from "@/app/actions/studio";

export function AddSituation({ unitId }: { unitId: string }) {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setBusy(true);
    setError(null);
    try {
      await createSituation(unitId, title);
    } catch (e) {
      if (e && typeof e === "object" && "digest" in e) return; // redirect
      setError(e instanceof Error ? e.message : "생성 실패");
      setBusy(false);
    }
  }

  return (
    <div className="row" style={{ alignItems: "flex-end" }}>
      <div className="field grow" style={{ marginBottom: 0 }}>
        <label>새 상황 제목</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 음식점에서 주문하기" />
      </div>
      <button className="btn" type="button" onClick={add} disabled={busy}>+ 상황 추가</button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
