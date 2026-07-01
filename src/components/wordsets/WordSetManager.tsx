"use client";

import { useState } from "react";
import {
  createWordSet,
  saveWordSetWords,
  getWordSetWords,
  setWordSetPublished,
  deleteWordSet,
  getDistributions,
  setDistributions,
  type RosterClass,
  type WordSetWordInput,
} from "@/app/actions/wordsets";
import { AiGenerateWords } from "@/components/AiGenerateWords";
import { parsePastedWords } from "@/lib/paste-words";

async function loadSuggest() {
  const mod = await import("@/lib/pinyin-suggest");
  return mod.suggestFromHanzi;
}

export interface SetSummary {
  id: string;
  title: string;
  description: string | null;
  status: string;
  wordCount: number;
  distCount: number;
}

type Row = WordSetWordInput;
const emptyRow = (): Row => ({ hanzi: "", correctPinyin: "", correctTones: "", acceptableMeanings: "", exampleSentence: "" });

export function WordSetManager({
  initialSets,
  roster,
  hasKey,
}: {
  initialSets: SetSummary[];
  roster: RosterClass[];
  hasKey: boolean;
}) {
  const [sets, setSets] = useState<SetSummary[]>(initialSets);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<"words" | "dist">("words");
  const [rows, setRows] = useState<Row[]>([]);
  const [paste, setPaste] = useState("");
  const [distClasses, setDistClasses] = useState<Set<string>>(new Set());
  const [distStudents, setDistStudents] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 새 세트
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const selected = sets.find((s) => s.id === selectedId) ?? null;

  function flash(m: string) {
    setMsg(m);
    setError(null);
  }

  async function selectSet(id: string) {
    setSelectedId(id);
    setTab("words");
    setMsg(null);
    setError(null);
    setBusy(true);
    try {
      const [w, d] = await Promise.all([getWordSetWords(id), getDistributions(id)]);
      setRows(w.length ? w : [emptyRow()]);
      setDistClasses(new Set(d.classIds));
      setDistStudents(new Set(d.studentIds));
    } catch (e) {
      setError(e instanceof Error ? e.message : "불러오기 실패");
    } finally {
      setBusy(false);
    }
  }

  async function createSet() {
    if (!newTitle.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const id = await createWordSet(newTitle, newDesc);
      const s: SetSummary = { id, title: newTitle.trim(), description: newDesc.trim() || null, status: "draft", wordCount: 0, distCount: 0 };
      setSets((xs) => [s, ...xs]);
      setNewTitle("");
      setNewDesc("");
      await selectSet(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "세트 생성 실패");
    } finally {
      setBusy(false);
    }
  }

  function updateRow(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function fillPinyin(i: number) {
    const hanzi = rows[i]?.hanzi.trim();
    if (!hanzi) return;
    const suggest = await loadSuggest();
    const s = suggest(hanzi);
    if (s.pinyin) updateRow(i, { correctPinyin: s.pinyin, correctTones: s.tones.join(" ") });
  }

  async function fillAllPinyin() {
    const suggest = await loadSuggest();
    setRows((rs) =>
      rs.map((r) => {
        if (!r.hanzi.trim() || r.correctPinyin.trim()) return r;
        const s = suggest(r.hanzi);
        return s.pinyin ? { ...r, correctPinyin: s.pinyin, correctTones: s.tones.join(" ") } : r;
      }),
    );
    flash("병음·성조 자동 채움 완료 — 검토 후 저장하세요.");
  }

  function applyPaste() {
    const parsed = parsePastedWords(paste);
    if (!parsed.length) {
      setError("붙여넣은 내용에서 단어를 찾지 못했습니다.");
      return;
    }
    const added: Row[] = parsed.map((p) => ({
      hanzi: p.hanzi,
      correctPinyin: "",
      correctTones: "",
      acceptableMeanings: p.meaning,
      exampleSentence: p.example,
    }));
    setRows((rs) => [...rs.filter((r) => r.hanzi.trim()), ...added]);
    setPaste("");
    flash(`${parsed.length}개 추가됨 — '병음 자동 채움' 후 저장하세요.`);
  }

  async function saveWords() {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    try {
      await saveWordSetWords(selectedId, rows);
      const count = rows.filter((r) => r.hanzi.trim()).length;
      setSets((xs) => xs.map((s) => (s.id === selectedId ? { ...s, wordCount: count } : s)));
      flash("저장됨");
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setBusy(false);
    }
  }

  async function togglePublish() {
    if (!selected) return;
    const next = selected.status !== "published";
    setBusy(true);
    setError(null);
    try {
      await setWordSetPublished(selected.id, next);
      setSets((xs) => xs.map((s) => (s.id === selected.id ? { ...s, status: next ? "published" : "draft" } : s)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "상태 변경 실패");
    } finally {
      setBusy(false);
    }
  }

  async function removeSet() {
    if (!selected) return;
    if (!confirm(`'${selected.title}' 세트를 삭제할까요? (되돌릴 수 없음)`)) return;
    setBusy(true);
    try {
      await deleteWordSet(selected.id);
      setSets((xs) => xs.filter((s) => s.id !== selected.id));
      setSelectedId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "삭제 실패");
    } finally {
      setBusy(false);
    }
  }

  function toggleClass(id: string) {
    setDistClasses((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function toggleStudent(id: string) {
    setDistStudents((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function saveDist() {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    try {
      await setDistributions(selectedId, [...distClasses], [...distStudents]);
      const distCount = distClasses.size + distStudents.size;
      setSets((xs) => xs.map((s) => (s.id === selectedId ? { ...s, distCount } : s)));
      flash("배부 저장됨");
    } catch (e) {
      setError(e instanceof Error ? e.message : "배부 저장 실패");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="row" style={{ alignItems: "flex-start", gap: 16 }}>
      {/* 좌측: 세트 목록 */}
      <div style={{ width: 280, flexShrink: 0 }}>
        <div className="card">
          <b>단어 세트 목록</b>
          <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>{sets.length}개</div>
          {sets.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => selectSet(s.id)}
              className="card"
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                marginBottom: 6,
                cursor: "pointer",
                borderColor: s.id === selectedId ? "var(--primary)" : undefined,
              }}
            >
              <div style={{ fontWeight: 600 }}>{s.title}</div>
              <div className="muted" style={{ fontSize: 12 }}>
                {s.wordCount}단어 · 배부 {s.distCount}건 · {s.status === "published" ? "공개" : "비공개"}
              </div>
            </button>
          ))}
        </div>
        <div className="card">
          <b>새 단어 세트 만들기</b>
          <div className="field" style={{ marginTop: 8 }}>
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="세트 이름 (예: 수능 고빈도)" />
          </div>
          <div className="field">
            <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="설명 (선택)" />
          </div>
          <button className="btn" type="button" onClick={createSet} disabled={busy || !newTitle.trim()}>만들기</button>
        </div>
      </div>

      {/* 우측: 편집/배부 */}
      <div className="grow">
        {!selected ? (
          <div className="card muted">왼쪽에서 세트를 선택하거나 새로 만드세요.</div>
        ) : (
          <>
            <div className="card row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <span style={{ fontSize: 18, fontWeight: 700 }}>{selected.title}</span>
                <span className="badge" style={{ marginLeft: 8 }}>{selected.status === "published" ? "공개" : "비공개"}</span>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <button className="btn secondary" type="button" onClick={togglePublish} disabled={busy}>
                  {selected.status === "published" ? "비공개로" : "공개"}
                </button>
                <button className="btn secondary" type="button" onClick={removeSet} disabled={busy}>삭제</button>
              </div>
            </div>

            <div className="row" style={{ gap: 8, margin: "8px 0" }}>
              <button className={`btn ${tab === "words" ? "" : "secondary"}`} type="button" onClick={() => setTab("words")}>단어 편집</button>
              <button className={`btn ${tab === "dist" ? "" : "secondary"}`} type="button" onClick={() => setTab("dist")}>배부 관리</button>
            </div>

            {msg && <p className="ok">{msg}</p>}
            {error && <p className="error">{error}</p>}

            {tab === "words" ? (
              <>
                <div className="card">
                  <b>붙여넣기 대량 입력</b>
                  <p className="muted" style={{ fontSize: 12, margin: "2px 0 6px" }}>
                    엑셀·구글시트에서 <b>단어(한자) · 의미 · 예문</b> 열을 복사해 붙여넣으세요(탭 구분).
                  </p>
                  <textarea rows={3} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={"你好\t안녕\t你好吗？\n谢谢\t고맙다"} style={{ width: "100%" }} />
                  <div className="row" style={{ gap: 8, marginTop: 6 }}>
                    <button className="btn secondary" type="button" onClick={applyPaste}>붙여넣기 반영</button>
                    <button className="btn secondary" type="button" onClick={fillAllPinyin}>병음·성조 자동 채움</button>
                  </div>
                </div>

                <AiGenerateWords
                  hasKey={hasKey}
                  sentenceTaskType="compose"
                  onGenerated={(ws) =>
                    setRows((rs) => [
                      ...rs.filter((r) => r.hanzi.trim()),
                      ...ws.map((w) => ({
                        hanzi: w.hanzi,
                        correctPinyin: w.correctPinyin,
                        correctTones: w.correctTones,
                        acceptableMeanings: w.acceptableMeanings,
                        exampleSentence: w.exampleSentence ?? "",
                      })),
                    ])
                  }
                />

                <div className="card">
                  {rows.map((r, i) => (
                    <div key={i} className="row" style={{ alignItems: "flex-end", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
                      <div className="field" style={{ width: 90, marginBottom: 0 }}>
                        <label>단어</label>
                        <input value={r.hanzi} onChange={(e) => updateRow(i, { hanzi: e.target.value })} onBlur={() => { if (!r.correctPinyin.trim()) void fillPinyin(i); }} />
                      </div>
                      <div className="field" style={{ width: 110, marginBottom: 0 }}>
                        <label>병음</label>
                        <input value={r.correctPinyin} onChange={(e) => updateRow(i, { correctPinyin: e.target.value })} placeholder="ni hao" />
                      </div>
                      <div className="field" style={{ width: 70, marginBottom: 0 }}>
                        <label>성조</label>
                        <input value={r.correctTones} onChange={(e) => updateRow(i, { correctTones: e.target.value })} placeholder="3 3" />
                      </div>
                      <div className="field grow" style={{ marginBottom: 0, minWidth: 120 }}>
                        <label>의미</label>
                        <input value={r.acceptableMeanings} onChange={(e) => updateRow(i, { acceptableMeanings: e.target.value })} placeholder="안녕, 안녕하세요" />
                      </div>
                      <div className="field grow" style={{ marginBottom: 0, minWidth: 120 }}>
                        <label>예문(선택)</label>
                        <input value={r.exampleSentence ?? ""} onChange={(e) => updateRow(i, { exampleSentence: e.target.value })} />
                      </div>
                      <button className="btn secondary" type="button" onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}>삭제</button>
                    </div>
                  ))}
                  <div className="row" style={{ gap: 8, marginTop: 8 }}>
                    <button className="btn secondary" type="button" onClick={() => setRows((rs) => [...rs, emptyRow()])}>+ 단어 추가</button>
                    <button className="btn" type="button" onClick={saveWords} disabled={busy}>저장</button>
                  </div>
                </div>
              </>
            ) : (
              <div className="card">
                <b>배부 관리</b>
                <p className="muted" style={{ fontSize: 12, margin: "2px 0 8px" }}>
                  반 전체 또는 개별 학생에게 배부합니다. 공개 상태여야 학생에게 보입니다.
                </p>
                {roster.length === 0 && <div className="muted">담당 반·학생이 없습니다. 먼저 반·학생을 등록하세요.</div>}
                {roster.map((c) => (
                  <div key={c.id} className="card" style={{ background: "#fafafa" }}>
                    <label style={{ fontWeight: 600 }}>
                      <input type="checkbox" checked={distClasses.has(c.id)} onChange={() => toggleClass(c.id)} /> {c.name} <span className="muted">(반 전체 {c.students.length}명)</span>
                    </label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 6, paddingLeft: 18 }}>
                      {c.students.map((s) => (
                        <label key={s.id} className="muted" style={{ fontSize: 13 }}>
                          <input type="checkbox" checked={distClasses.has(c.id) || distStudents.has(s.id)} disabled={distClasses.has(c.id)} onChange={() => toggleStudent(s.id)} /> {s.name}{s.classNo ? ` (${s.classNo})` : ""}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
                <div className="row" style={{ marginTop: 8 }}>
                  <button className="btn" type="button" onClick={saveDist} disabled={busy}>배부 저장</button>
                  <span className="muted" style={{ fontSize: 13, alignSelf: "center", marginLeft: 8 }}>
                    선택: 반 {distClasses.size} · 학생 {distStudents.size}
                  </span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
