"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateUnitMeta, deleteUnit } from "@/app/actions/studio";
import type { ClassRow, Unit } from "@/lib/database.types";

export function UnitMetaForm({ unit, classes }: { unit: Unit; classes: ClassRow[] }) {
  const router = useRouter();
  const [title, setTitle] = useState(unit.title);
  const [subtitle, setSubtitle] = useState(unit.subtitle ?? "");
  const [theme, setTheme] = useState(unit.theme ?? "");
  const [culture, setCulture] = useState(unit.culture_note ?? "");
  const [classId, setClassId] = useState(unit.class_id ?? "");
  const [published, setPublished] = useState(unit.published);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      await updateUnitMeta(unit.id, {
        title: title.trim() || "새 단원",
        subtitle: subtitle.trim() || null,
        theme: theme.trim() || null,
        cultureNote: culture.trim() || null,
        classId: classId || null,
        published,
      });
      setMsg("저장됨");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("이 단원과 모든 상황을 삭제할까요? 되돌릴 수 없습니다.")) return;
    setBusy(true);
    try {
      await deleteUnit(unit.id);
    } catch (e) {
      if (e && typeof e === "object" && "digest" in e) return; // redirect
      setError(e instanceof Error ? e.message : "삭제 실패");
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>단원 정보</h3>
      <div className="row">
        <div className="field grow">
          <label>제목</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field" style={{ width: 120 }}>
          <label>부제</label>
          <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="1과" />
        </div>
      </div>
      <div className="field">
        <label>테마</label>
        <input value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="인사 / 감사 / 사과" />
      </div>
      <div className="field">
        <label>문화 설명(선택)</label>
        <textarea rows={2} value={culture} onChange={(e) => setCulture(e.target.value)} />
      </div>
      <div className="row">
        <div className="field grow">
          <label>대상 반</label>
          <select value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">(미지정 — 배포해도 학생에게 안 보임)</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" style={{ width: "auto" }} checked={published} onChange={(e) => setPublished(e.target.checked)} />
          학생에게 배포
        </label>
      </div>
      <div className="row" style={{ alignItems: "center" }}>
        <button className="btn" type="button" onClick={save} disabled={busy}>저장</button>
        <button className="btn secondary" type="button" onClick={remove} disabled={busy}>단원 삭제</button>
        {msg && <span className="ok" style={{ fontSize: 13 }}>{msg}</span>}
      </div>
      {published && !classId && (
        <p className="muted" style={{ fontSize: 12, margin: "6px 0 0", color: "var(--warn)" }}>
          ⚠ 대상 반을 지정해야 학생에게 노출됩니다.
        </p>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
