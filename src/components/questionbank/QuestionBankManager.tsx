"use client";

import { useMemo, useState } from "react";
import {
  saveTypes,
  saveExamples,
  deleteExample,
  saveGuidelines,
  generateExamBySpecs,
  refineExamItem,
  saveItemToBank,
  saveGeneratedSet,
  getSetItems,
  updateSet,
  deleteSet,
  createPaper,
  addItemsToPaper,
  moveItemsToPaper,
  setQbankShared,
  getQbankDistributions,
  setQbankDistributions,
  classifyExamItems,
  type QbankExampleInput,
  type GeneratedItem,
  type SavedItemInput,
} from "@/app/actions/question-bank";
import type { RosterClass } from "@/app/actions/wordsets";
import type { ExtractedExample } from "@/lib/qbank-extract";
import { ExamPreview, MarkedText, circled } from "@/components/questionbank/ExamPreview";
import type { QbankType, QbankExample, QbankSet, QbankItem } from "@/lib/database.types";

type Tab = "examples" | "guidelines" | "generate" | "result" | "archive" | "papers";
type SetSummary = QbankSet & { itemCount: number };

interface ExRow {
  id?: string;
  typeId: string | null;
  qnum: string;
  passage: string;
  stem: string;
  choices: string[];
  answerIndex: number | null;
  explanation: string;
  source: string;
}
interface ItemSnapshot {
  passage: string;
  stem: string;
  choices: string[];
  answerIndex: number;
  explanation: string;
  typeName?: string;
  typeId?: string | null;
}
interface ItemRow {
  id?: string;
  passage: string;
  stem: string;
  choices: string[];
  answerIndex: number;
  explanation: string;
  typeName?: string; // 표시용(어떤 유형으로 생성됐는지)
  typeId?: string | null; // 유형변경·AI 수정 참조용
  original?: ItemSnapshot; // 되돌리기용 최초 생성본
  saved?: boolean; // 낱개 보관 완료 여부
  addedPapers?: string[]; // 표시용: 이 문항을 담은 시험지 제목들(비영속)
}

/** 되돌리기용 스냅샷 생성(최초 생성본 보존). */
function snapshot(it: {
  passage: string;
  stem: string;
  choices: string[];
  answerIndex: number;
  explanation: string;
  typeName?: string;
  typeId?: string | null;
}): ItemSnapshot {
  return {
    passage: it.passage,
    stem: it.stem,
    choices: [...it.choices],
    answerIndex: it.answerIndex,
    explanation: it.explanation,
    typeName: it.typeName,
    typeId: it.typeId ?? null,
  };
}

function toExRow(e: QbankExample): ExRow {
  return {
    id: e.id,
    typeId: e.type_id,
    qnum: e.qnum ?? "",
    passage: e.passage ?? "",
    stem: e.stem,
    choices: e.choices.length ? e.choices : ["", "", "", ""],
    answerIndex: e.answer_index,
    explanation: e.explanation ?? "",
    source: e.source ?? "",
  };
}
const emptyEx = (typeId: string | null): ExRow => ({
  typeId,
  qnum: "",
  passage: "",
  stem: "",
  choices: ["", "", "", ""],
  answerIndex: null,
  explanation: "",
  source: "",
});

export function QuestionBankManager({
  hasKey,
  initialTypes,
  initialExamples,
  initialGuidelines,
  initialSets,
  roster,
}: {
  hasKey: boolean;
  initialTypes: QbankType[];
  initialExamples: QbankExample[];
  initialGuidelines: string;
  initialSets: SetSummary[];
  roster: RosterClass[];
}) {
  const [tab, setTab] = useState<Tab>("examples");
  const [types, setTypes] = useState<QbankType[]>(initialTypes);
  const [exRows, setExRows] = useState<ExRow[]>(initialExamples.map(toExRow));
  const [guidelines, setGuidelines] = useState(initialGuidelines);
  const [sets, setSets] = useState<SetSummary[]>(initialSets);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 생성 draft(새 시험 생성 ↔ 생성 결과 공유)
  const [genItems, setGenItems] = useState<ItemRow[]>([]);
  const [genTitle, setGenTitle] = useState("");
  const [genSource, setGenSource] = useState("");
  const [genSpec, setGenSpec] = useState<unknown>(null);

  function flash(m: string) {
    setMsg(m);
    setError(null);
  }
  function fail(e: unknown) {
    setError(e instanceof Error ? e.message : "오류가 발생했습니다");
    setMsg(null);
  }
  const typeNameById = useMemo(() => new Map(types.map((t) => [t.id, t.name])), [types]);

  const TABS: { key: Tab; label: string }[] = [
    { key: "examples", label: "기출 예시" },
    { key: "guidelines", label: "출제 지침" },
    { key: "generate", label: "새 시험 생성" },
    { key: "result", label: "생성 결과" },
    { key: "archive", label: "보관함" },
    { key: "papers", label: "시험지" },
  ];

  return (
    <div>
      <div className="row" style={{ gap: 6, marginBottom: 12 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`btn ${tab === t.key ? "" : "secondary"}`}
            onClick={() => {
              setTab(t.key);
              setMsg(null);
              setError(null);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {msg && <p className="ok">{msg}</p>}
      {error && <p className="error">{error}</p>}

      {tab === "examples" && (
        <ExamplesTab
          hasKey={hasKey}
          types={types}
          setTypes={setTypes}
          rows={exRows}
          setRows={setExRows}
          busy={busy}
          setBusy={setBusy}
          flash={flash}
          fail={fail}
        />
      )}
      {tab === "guidelines" && (
        <GuidelinesTab value={guidelines} setValue={setGuidelines} busy={busy} setBusy={setBusy} flash={flash} fail={fail} />
      )}
      {tab === "generate" && (
        <GenerateTab
          hasKey={hasKey}
          types={types}
          items={genItems}
          setItems={setGenItems}
          setTitle={setGenTitle}
          setSource={setGenSource}
          setSpec={setGenSpec}
          goResult={() => setTab("result")}
          busy={busy}
          setBusy={setBusy}
          flash={flash}
          fail={fail}
        />
      )}
      {tab === "result" && (
        <ResultTab
          types={types}
          items={genItems}
          title={genTitle}
          setTitle={setGenTitle}
          source={genSource}
          spec={genSpec}
          setItems={setGenItems}
          busy={busy}
          setBusy={setBusy}
          flash={flash}
          fail={fail}
          onSaved={(s) => {
            setSets((xs) => [s, ...xs]);
            setGenItems([]);
            setGenTitle("");
          }}
        />
      )}
      {tab === "archive" && (
        <ArchiveTab sets={sets} setSets={setSets} types={types} typeNameById={typeNameById} busy={busy} setBusy={setBusy} flash={flash} fail={fail} />
      )}
      {tab === "papers" && (
        <PapersTab sets={sets} setSets={setSets} types={types} typeNameById={typeNameById} roster={roster} busy={busy} setBusy={setBusy} flash={flash} fail={fail} />
      )}
    </div>
  );
}

// ───────────────────── 공용: 선지 편집 ─────────────────────

function ChoiceEditor({
  choices,
  answerIndex,
  onChange,
  disabled,
}: {
  choices: string[];
  answerIndex: number | null;
  onChange: (choices: string[], answerIndex: number | null) => void;
  disabled?: boolean;
}) {
  return (
    <div style={{ display: "grid", gap: 4 }}>
      {choices.map((c, i) => (
        <div key={i} className="row" style={{ gap: 6, alignItems: "center" }}>
          <input
            type="radio"
            checked={answerIndex === i}
            onChange={() => onChange(choices, i)}
            disabled={disabled}
            title="정답으로 표시"
          />
          <input
            value={c}
            onChange={(e) => onChange(choices.map((x, k) => (k === i ? e.target.value : x)), answerIndex)}
            placeholder={`선지 ${i + 1}`}
            disabled={disabled}
            style={{ flex: 1 }}
          />
          <button
            type="button"
            className="btn secondary"
            style={{ padding: "4px 8px" }}
            disabled={disabled || choices.length <= 2}
            onClick={() => {
              const next = choices.filter((_, k) => k !== i);
              const ai = answerIndex === null ? null : answerIndex === i ? null : answerIndex > i ? answerIndex - 1 : answerIndex;
              onChange(next, ai);
            }}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn secondary"
        style={{ padding: "4px 8px", width: "fit-content" }}
        disabled={disabled || choices.length >= 6}
        onClick={() => onChange([...choices, ""], answerIndex)}
      >
        + 선지
      </button>
    </div>
  );
}

// ───────────────────── 기출 예시 탭 ─────────────────────

function ExamplesTab({
  hasKey,
  types,
  setTypes,
  rows,
  setRows,
  busy,
  setBusy,
  flash,
  fail,
}: {
  hasKey: boolean;
  types: QbankType[];
  setTypes: (t: QbankType[]) => void;
  rows: ExRow[];
  setRows: React.Dispatch<React.SetStateAction<ExRow[]>>;
  busy: boolean;
  setBusy: (b: boolean) => void;
  flash: (m: string) => void;
  fail: (e: unknown) => void;
}) {
  const [typeOpen, setTypeOpen] = useState(false);
  const [typeDraft, setTypeDraft] = useState<{ id?: string; name: string }[]>(types.map((t) => ({ id: t.id, name: t.name })));

  async function saveTypeList() {
    setBusy(true);
    try {
      const fresh = await saveTypes(typeDraft);
      setTypes(fresh);
      setTypeDraft(fresh.map((t) => ({ id: t.id, name: t.name })));
      setTypeOpen(false);
      flash("유형 저장됨");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function onFile(file: File) {
    if (!file) return;
    setBusy(true);
    try {
      // 대용량 파일은 서버 액션 대신 Route Handler(multipart)로 업로드 → React Flight 인자 한도 회피
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/qbank/extract", { method: "POST", body: fd });
      const json = (await res.json()) as { items?: ExtractedExample[]; error?: string };
      if (!res.ok) throw new Error(json.error || "추출 실패");
      const extracted = json.items ?? [];
      if (!extracted.length) {
        fail(new Error("추출된 문항이 없습니다. 다른 파일을 시도하세요."));
        return;
      }
      // AI가 '유형 관리'의 기존 유형 중에서 분류한 결과만 매칭(없거나 미분류면 미지정)
      const byName = new Map(types.map((t) => [t.name.trim(), t.id]));
      const newRows: ExRow[] = extracted.map((it) => ({
        typeId: byName.get(it.type.trim()) ?? null,
        qnum: it.number,
        passage: it.passage,
        stem: it.stem,
        choices: it.choices.length ? it.choices : ["", "", "", ""],
        answerIndex: it.answerIndex,
        explanation: it.explanation,
        source: "",
      }));
      setRows((rs) => [...newRows, ...rs]);
      const unmatched = newRows.filter((r) => !r.typeId).length;
      flash(
        `${extracted.length}개 추출됨 · 유형 자동 분류` +
          (unmatched ? ` (미분류 ${unmatched}개 — 유형 관리에 유형을 추가하면 매칭됩니다)` : "") +
          " — 검토·수정 후 저장하세요.",
      );
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    try {
      const input: QbankExampleInput[] = rows.map((r) => ({
        id: r.id,
        typeId: r.typeId,
        qnum: r.qnum,
        passage: r.passage,
        stem: r.stem,
        choices: r.choices,
        answerIndex: r.answerIndex,
        explanation: r.explanation,
        source: r.source,
      }));
      const fresh = await saveExamples(input);
      setRows(fresh.map(toExRow));
      flash("기출 예시 저장됨");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  function patch(i: number, p: Partial<ExRow>) {
    setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...p } : r)));
  }

  async function delRow(i: number) {
    const r = rows[i];
    if (r?.id) {
      if (!confirm("이 기출 예시를 삭제할까요?")) return;
      setBusy(true);
      try {
        await deleteExample(r.id);
      } catch (e) {
        fail(e);
        setBusy(false);
        return;
      }
      setBusy(false);
      flash("예시 삭제됨");
    }
    setRows((rs) => rs.filter((_, k) => k !== i));
  }

  // 유형별 그룹(등록 유형 순서 → 미지정 마지막). 각 행의 원본 인덱스를 유지해 편집·삭제에 사용.
  const groupOrder: (string | null)[] = [...types.map((t) => t.id), null];
  const rowsByGroup = new Map<string | null, { r: ExRow; idx: number }[]>();
  rows.forEach((r, idx) => {
    const key = r.typeId ?? null;
    const arr = rowsByGroup.get(key) ?? [];
    arr.push({ r, idx });
    rowsByGroup.set(key, arr);
  });
  const groups = groupOrder
    .map((tid) => ({
      tid,
      label: tid ? types.find((t) => t.id === tid)?.name ?? "유형" : "유형 미지정",
      items: rowsByGroup.get(tid) ?? [],
    }))
    .filter((g) => g.items.length > 0);

  return (
    <div>
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <b>기출 예시로 스타일 학습</b>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn secondary" onClick={() => setTypeOpen((v) => !v)}>유형 관리</button>
            <button type="button" className="btn secondary" onClick={() => setRows((rs) => [emptyEx(types[0]?.id ?? null), ...rs])}>+ 예시 추가</button>
          </div>
        </div>
        <p className="muted" style={{ fontSize: 13, margin: "6px 0 0" }}>
          유형별로 기출/우수 문항을 등록하면 AI가 그 발문·선지·정답 패턴을 따라 생성합니다. 유형당 2~3개 권장.
        </p>

        {typeOpen && (
          <div className="card" style={{ background: "#fafafa", marginTop: 8 }}>
            <b style={{ fontSize: 14 }}>유형 관리</b>
            <div style={{ display: "grid", gap: 6, margin: "8px 0" }}>
              {typeDraft.map((t, i) => (
                <div key={i} className="row" style={{ gap: 6 }}>
                  <input value={t.name} onChange={(e) => setTypeDraft((ts) => ts.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} placeholder="유형 이름 (예: 빈칸 추론)" style={{ flex: 1 }} />
                  <button type="button" className="btn secondary" onClick={() => setTypeDraft((ts) => ts.filter((_, k) => k !== i))}>삭제</button>
                </div>
              ))}
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button type="button" className="btn secondary" onClick={() => setTypeDraft((ts) => [...ts, { name: "" }])}>+ 유형</button>
              <button type="button" className="btn" onClick={saveTypeList} disabled={busy}>유형 저장</button>
            </div>
          </div>
        )}

        <div className="card" style={{ marginTop: 8, marginBottom: 0 }}>
          <b style={{ fontSize: 14 }}>📄 기출 PDF·이미지로 일괄 등록</b>
          <p className="muted" style={{ fontSize: 12, margin: "2px 0 6px" }}>문제 PDF/사진을 올리면 번호·발문·지문·선지·정답·해설을 자동 추출하고, <b>‘유형 관리’에 등록된 유형</b> 중에서 자동 분류합니다.</p>
          {hasKey ? (
            <input type="file" accept="application/pdf,image/*" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ""; }} />
          ) : (
            <p className="error" style={{ fontSize: 13 }}>AI 추출이 비활성화되어 있습니다. 서버에 ANTHROPIC_API_KEY(.env.local)를 설정하세요.</p>
          )}
        </div>
      </div>

      {rows.length === 0 && <div className="card muted">등록된 기출 예시가 없습니다. “+ 예시 추가” 또는 파일로 등록하세요.</div>}

      {groups.map((g) => (
        <div key={g.tid ?? "none"}>
          <div
            className="row"
            style={{ justifyContent: "space-between", alignItems: "baseline", margin: "16px 0 6px", paddingBottom: 4, borderBottom: "2px solid var(--border)" }}
          >
            <b style={{ fontSize: 15 }}>
              {g.label} <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>({g.items.length}문항)</span>
            </b>
            <span className="muted" style={{ fontSize: 13 }}>
              번호: {g.items.map((x) => x.r.qnum.trim() || "?").join(", ")}
            </span>
          </div>
          {g.items.map(({ r, idx }) => (
            <div className="card" key={r.id ?? `new-${idx}`}>
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <div className="row" style={{ gap: 8, alignItems: "center" }}>
                  <label style={{ margin: 0, display: "flex", alignItems: "center", gap: 4 }}>
                    <span className="muted" style={{ fontSize: 13 }}>번호</span>
                    <input value={r.qnum} onChange={(e) => patch(idx, { qnum: e.target.value })} placeholder="예: 2" style={{ width: 64, textAlign: "center" }} />
                  </label>
                  <select value={r.typeId ?? ""} onChange={(e) => patch(idx, { typeId: e.target.value || null })} style={{ width: 200 }}>
                    <option value="">유형 미지정</option>
                    {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <button type="button" className="btn secondary" onClick={() => void delRow(idx)} disabled={busy}>예시 삭제</button>
              </div>
              <div className="field" style={{ marginTop: 8 }}>
                <label>지문(선택)</label>
                <textarea rows={2} value={r.passage} onChange={(e) => patch(idx, { passage: e.target.value })} placeholder="제시문이 있으면 입력" />
              </div>
              <div className="field">
                <label>발문</label>
                <input value={r.stem} onChange={(e) => patch(idx, { stem: e.target.value })} placeholder="예: 밑줄 친 부분의 의미로 알맞은 것은?" />
              </div>
              <label style={{ fontSize: 13, color: "var(--muted)" }}>선지 · 정답(라디오)</label>
              <ChoiceEditor choices={r.choices} answerIndex={r.answerIndex} onChange={(choices, answerIndex) => patch(idx, { choices, answerIndex })} />
              <div className="row" style={{ gap: 8, marginTop: 8 }}>
                <div className="field grow" style={{ marginBottom: 0 }}>
                  <label>해설(선택)</label>
                  <input value={r.explanation} onChange={(e) => patch(idx, { explanation: e.target.value })} />
                </div>
                <div className="field" style={{ marginBottom: 0, width: 180 }}>
                  <label>출처(선택)</label>
                  <input value={r.source} onChange={(e) => patch(idx, { source: e.target.value })} placeholder="예: 2024 수능" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}

      <button type="button" className="btn" onClick={save} disabled={busy} style={{ marginTop: 12 }}>{busy ? "저장 중…" : "기출 예시 저장"}</button>
    </div>
  );
}

// ───────────────────── 출제 지침 탭 ─────────────────────

function GuidelinesTab({
  value,
  setValue,
  busy,
  setBusy,
  flash,
  fail,
}: {
  value: string;
  setValue: (v: string) => void;
  busy: boolean;
  setBusy: (b: boolean) => void;
  flash: (m: string) => void;
  fail: (e: unknown) => void;
}) {
  async function save() {
    setBusy(true);
    try {
      await saveGuidelines(value);
      flash("출제 지침 저장됨");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="card">
      <b>출제 지침</b>
      <p className="muted" style={{ fontSize: 13, margin: "4px 0 8px" }}>
        생성 시 항상 반영할 규칙을 적어두세요. (예: 선지는 5개, 오답은 지문 근거로 매력적으로, 해설은 2문장 이내 등)
      </p>
      <textarea rows={8} value={value} onChange={(e) => setValue(e.target.value)} placeholder={"예:\n- 선지는 5개(①~⑤)\n- 정답 근거를 해설 첫 문장에 명시\n- 난도는 중상"} />
      <div className="row" style={{ marginTop: 8 }}>
        <button type="button" className="btn" onClick={save} disabled={busy}>{busy ? "저장 중…" : "지침 저장"}</button>
      </div>
    </div>
  );
}

// ───────────────────── 새 시험 생성 탭 ─────────────────────

function GenerateTab({
  hasKey,
  types,
  items,
  setItems,
  setTitle,
  setSource,
  setSpec,
  goResult,
  busy,
  setBusy,
  flash,
  fail,
}: {
  hasKey: boolean;
  types: QbankType[];
  items: ItemRow[];
  setItems: React.Dispatch<React.SetStateAction<ItemRow[]>>;
  setTitle: (t: string) => void;
  setSource: (s: string) => void;
  setSpec: (s: unknown) => void;
  goResult: () => void;
  busy: boolean;
  setBusy: (b: boolean) => void;
  flash: (m: string) => void;
  fail: (e: unknown) => void;
}) {
  const [passage, setPassage] = useState("");
  const [difficulty, setDifficulty] = useState("보통");
  const [counts, setCounts] = useState<Record<string, string>>({});

  const specs = types
    .map((t) => ({ typeId: t.id, name: t.name, count: Math.max(0, Math.floor(Number(counts[t.id] ?? "0")) || 0) }))
    .filter((s) => s.count > 0);
  const totalCount = specs.reduce((n, s) => n + s.count, 0);

  async function generate() {
    if (!specs.length) {
      fail(new Error("유형별 문항 수를 1개 이상 지정하세요."));
      return;
    }
    setBusy(true);
    try {
      const gen: GeneratedItem[] = await generateExamBySpecs({
        specs: specs.map((s) => ({ typeId: s.typeId, count: s.count })),
        passage,
        difficulty,
      });
      if (!gen.length) {
        fail(new Error("생성된 문항이 없습니다. 입력을 바꿔 다시 시도하세요."));
        return;
      }
      setItems(gen.map((g) => ({ ...g, original: snapshot(g) })));
      setSource(passage);
      setSpec({ specs: specs.map((s) => ({ typeId: s.typeId, name: s.name, count: s.count })), difficulty });
      setTitle("AI 생성 시험");
      flash(`${gen.length}개 생성됨 — '생성 결과' 탭에서 수정·저장하세요.`);
      goResult();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="card">
        <b>새 시험 생성</b>
        {!hasKey ? (
          <p className="error" style={{ margin: "8px 0 0" }}>AI 생성이 비활성화되어 있습니다. 서버에 ANTHROPIC_API_KEY(.env.local)를 설정하세요.</p>
        ) : types.length === 0 ? (
          <p className="muted" style={{ margin: "8px 0 0" }}>먼저 “기출 예시 → 유형 관리”에서 유형을 등록하고, 유형별로 기출 예시를 넣어 주세요.</p>
        ) : (
          <>
            <div className="field" style={{ marginTop: 8, marginBottom: 4 }}>
              <label>유형별 문항 수</label>
              <p className="muted" style={{ fontSize: 12, margin: "0 0 6px" }}>각 유형에 만들 문항 수를 입력하세요. 유형별로 그 유형의 기출 예시 형식대로 생성됩니다.</p>
              <div style={{ display: "grid", gap: 6, maxWidth: 420 }}>
                {types.map((t) => (
                  <div key={t.id} className="row" style={{ gap: 8, alignItems: "center" }}>
                    <span style={{ flex: 1 }}>{t.name}</span>
                    <input
                      type="number"
                      min={0}
                      max={20}
                      value={counts[t.id] ?? ""}
                      placeholder="0"
                      onChange={(e) => setCounts((c) => ({ ...c, [t.id]: e.target.value }))}
                      style={{ width: 80, textAlign: "center" }}
                    />
                    <span className="muted" style={{ fontSize: 12, width: 28 }}>문항</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="row" style={{ gap: 12, alignItems: "flex-end" }}>
              <div className="field" style={{ marginBottom: 0, width: 110 }}>
                <label>난이도</label>
                <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                  <option>쉬움</option>
                  <option>보통</option>
                  <option>어려움</option>
                </select>
              </div>
              <span className="muted" style={{ fontSize: 13, alignSelf: "center" }}>합계 {totalCount}문항</span>
            </div>
            <div className="field" style={{ marginTop: 8 }}>
              <label>지문/소재(선택)</label>
              <textarea rows={5} value={passage} onChange={(e) => setPassage(e.target.value)} placeholder="문항의 바탕이 될 지문·내용(선택). 비워두면 기출 예시와 같은 주제 범위에서 출제합니다. 각 문항의 제시문은 기출 형식대로 자동 생성됩니다." />
            </div>
            <button type="button" className="btn" onClick={generate} disabled={busy || totalCount === 0}>{busy ? "생성 중…" : `AI로 생성 (${totalCount}문항)`}</button>
          </>
        )}
      </div>

      {items.length > 0 && (
        <div className="card row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <span className="muted" style={{ fontSize: 13 }}>생성된 문항 {items.length}개가 대기 중이에요. ‘생성 결과’에서 수정·보관하세요.</span>
          <button type="button" className="btn" onClick={goResult}>생성 결과 →</button>
        </div>
      )}
    </div>
  );
}

// ───────────────────── 생성 결과 탭(시험지 미리보기) ─────────────────────

function ResultTab({
  types,
  items,
  title,
  setTitle,
  source,
  spec,
  setItems,
  busy,
  setBusy,
  flash,
  fail,
  onSaved,
}: {
  types: QbankType[];
  items: ItemRow[];
  title: string;
  setTitle: (t: string) => void;
  source: string;
  spec: unknown;
  setItems: React.Dispatch<React.SetStateAction<ItemRow[]>>;
  busy: boolean;
  setBusy: (b: boolean) => void;
  flash: (m: string) => void;
  fail: (e: unknown) => void;
  onSaved: (s: SetSummary) => void;
}) {
  const difficulty = (spec as { difficulty?: string } | null)?.difficulty ?? "보통";

  function patchOne(i: number, p: Partial<ItemRow>) {
    setItems((xs) => xs.map((x, k) => (k === i ? { ...x, ...p } : x)));
  }
  function deleteOne(i: number) {
    setItems((xs) => xs.filter((_, k) => k !== i));
  }
  function changeType(i: number, typeId: string | null) {
    const name = typeId ? types.find((t) => t.id === typeId)?.name : undefined;
    patchOne(i, { typeId, typeName: name });
  }
  function revertOne(i: number) {
    setItems((xs) =>
      xs.map((x, k) => {
        if (k !== i || !x.original) return x;
        const o = x.original;
        return {
          ...x,
          passage: o.passage,
          stem: o.stem,
          choices: [...o.choices],
          answerIndex: o.answerIndex,
          explanation: o.explanation,
          typeName: o.typeName,
          typeId: o.typeId ?? null,
          saved: false,
        };
      }),
    );
    flash("최초 생성본으로 되돌렸어요.");
  }
  async function refineOne(i: number, instruction: string): Promise<boolean> {
    const it = items[i];
    if (!it) return false;
    try {
      const revised = await refineExamItem({
        typeId: it.typeId ?? null,
        item: { passage: it.passage, stem: it.stem, choices: it.choices, answerIndex: it.answerIndex, explanation: it.explanation },
        instruction,
        difficulty,
      });
      setItems((xs) =>
        xs.map((x, k) =>
          k === i
            ? {
                ...x,
                passage: revised.passage,
                stem: revised.stem,
                choices: revised.choices,
                answerIndex: revised.answerIndex,
                explanation: revised.explanation,
                saved: false,
              }
            : x,
        ),
      );
      flash("AI가 문항을 수정했어요.");
      return true;
    } catch (e) {
      fail(e);
      return false;
    }
  }
  async function saveOne(i: number): Promise<boolean> {
    const it = items[i];
    if (!it) return false;
    try {
      await saveItemToBank(toSavedInput(it));
      patchOne(i, { saved: true });
      flash("‘보관 문항’ 세트에 저장됨 (보관함에서 확인)");
      return true;
    } catch (e) {
      fail(e);
      return false;
    }
  }

  async function save() {
    setBusy(true);
    try {
      const setId = await saveGeneratedSet({
        title,
        passage: source,
        spec: spec ?? null,
        items: items.map(toSavedInput),
      });
      onSaved({
        id: setId,
        teacher_id: "",
        title: title.trim() || "제목 없는 시험",
        passage: source.trim() || null,
        spec: null,
        shared: false,
        class_id: null,
        created_at: new Date().toISOString(),
        itemCount: items.filter((i) => i.stem.trim()).length,
      });
      flash("보관함에 저장됨");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  if (items.length === 0) {
    return <div className="card muted">먼저 “새 시험 생성”에서 문항을 생성하세요. 생성하면 여기서 시험지 형태로 미리봅니다.</div>;
  }

  const byType = new Map<string, number>();
  for (const it of items) {
    const k = it.typeName?.trim() || "기타";
    byType.set(k, (byType.get(k) ?? 0) + 1);
  }
  const typeSummary = [...byType.entries()].map(([n, c]) => `${n} ${c}문항`).join(" · ");

  return (
    <div>
      <div className="card row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div className="row" style={{ gap: 8, alignItems: "center", flex: 1 }}>
          <b style={{ whiteSpace: "nowrap" }}>시험지 미리보기</b>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="시험 제목" style={{ flex: 1, maxWidth: 320 }} />
        </div>
        <button type="button" className="btn" onClick={save} disabled={busy}>{busy ? "저장 중…" : "보관함에 저장"}</button>
      </div>
      {title.trim() && <h2 style={{ textAlign: "center", margin: "6px 0 4px" }}>{title}</h2>}
      <p className="muted" style={{ textAlign: "center", fontSize: 13, margin: "0 0 12px" }}>
        총 {items.length}문항 · {typeSummary}
      </p>
      <p className="muted" style={{ fontSize: 12, margin: "0 0 10px" }}>
        각 문항에서 <b>수정</b>(직접) · <b>AI 수정</b>(요청 입력) · <b>유형변경</b> · <b>되돌리기</b>(최초 생성본) · <b>보관</b>(문항 낱개 저장)을 할 수 있어요.
      </p>
      {items.map((it, i) => (
        <ResultItem
          key={i}
          index={i}
          it={it}
          types={types}
          busy={busy}
          onPatch={(p) => patchOne(i, p)}
          onDelete={() => deleteOne(i)}
          onChangeType={(id) => changeType(i, id)}
          onRevert={() => revertOne(i)}
          onRefine={(ins) => refineOne(i, ins)}
          onSaveOne={() => saveOne(i)}
        />
      ))}
      <button type="button" className="btn secondary" onClick={() => setItems([])}>미리보기 비우기</button>
    </div>
  );
}

// ───────────────────── 생성 결과: 문항 카드(미리보기 ↔ 편집 + 툴바) ─────────────────────

function ResultItem({
  index,
  it,
  types,
  busy,
  onPatch,
  onDelete,
  onChangeType,
  onRevert,
  onRefine,
  onSaveOne,
  extraTools,
}: {
  index: number;
  it: ItemRow;
  types: QbankType[];
  busy: boolean;
  onPatch: (p: Partial<ItemRow>) => void;
  onDelete: () => void;
  onChangeType: (typeId: string | null) => void;
  onRevert: () => void;
  onRefine: (instruction: string) => Promise<boolean>;
  onSaveOne?: () => Promise<boolean>;
  extraTools?: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [working, setWorking] = useState(false);
  const lock = busy || working;

  async function applyAi() {
    if (!instruction.trim()) return;
    setWorking(true);
    const ok = await onRefine(instruction.trim());
    setWorking(false);
    if (ok) {
      setInstruction("");
      setAiOpen(false);
    }
  }
  async function saveOne() {
    if (!onSaveOne) return;
    setWorking(true);
    await onSaveOne();
    setWorking(false);
  }

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <span className="muted" style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          문항 {index + 1}
          {it.typeName ? <span className="badge">{it.typeName}</span> : null}
          {it.saved ? <span className="badge" style={{ background: "var(--primary)", color: "#fff" }}>보관됨</span> : null}
          {it.addedPapers?.length ? (
            <span className="badge" style={{ background: "var(--primary)", color: "#fff" }}>✓ 시험지 담김: {it.addedPapers.join(", ")}</span>
          ) : null}
        </span>
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          <select
            value={it.typeId ?? ""}
            onChange={(e) => onChangeType(e.target.value || null)}
            disabled={lock}
            title="유형 변경"
            style={{ padding: "4px 6px" }}
          >
            <option value="">(유형 없음)</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <button type="button" className={`btn ${editing ? "" : "secondary"}`} style={{ padding: "4px 8px" }} disabled={lock} onClick={() => setEditing((v) => !v)}>
            {editing ? "완료" : "수정"}
          </button>
          <button type="button" className={`btn ${aiOpen ? "" : "secondary"}`} style={{ padding: "4px 8px" }} disabled={lock} onClick={() => setAiOpen((v) => !v)}>
            AI 수정
          </button>
          <button type="button" className="btn secondary" style={{ padding: "4px 8px" }} disabled={lock || !it.original} onClick={onRevert}>
            되돌리기
          </button>
          {onSaveOne && (
            <button type="button" className="btn secondary" style={{ padding: "4px 8px" }} disabled={lock || it.saved} onClick={saveOne}>
              {it.saved ? "보관됨" : working ? "저장 중…" : "보관"}
            </button>
          )}
          {extraTools}
          <button type="button" className="btn secondary" style={{ padding: "4px 8px" }} disabled={lock} onClick={onDelete}>
            삭제
          </button>
        </div>
      </div>

      {aiOpen && (
        <div className="field" style={{ marginTop: 8, marginBottom: 0 }}>
          <label>AI 수정 요청</label>
          <div className="row" style={{ gap: 6, alignItems: "flex-start" }}>
            <textarea
              rows={2}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="예: 더 쉽게 / 지문을 음식 주제로 / 선지를 더 헷갈리게 / 성조 배열 문항으로 바꿔줘"
              style={{ flex: 1 }}
              disabled={working}
            />
            <button type="button" className="btn" style={{ whiteSpace: "nowrap" }} disabled={working || !instruction.trim()} onClick={applyAi}>
              {working ? "수정 중…" : "적용"}
            </button>
          </div>
        </div>
      )}

      {editing ? (
        <div style={{ marginTop: 8 }}>
          <div className="field">
            <label>제시문(지문) — 빈칸/밑줄 문장·&lt;보기&gt;·[그림/표] 설명 등</label>
            <textarea rows={3} value={it.passage} onChange={(e) => onPatch({ passage: e.target.value })} placeholder="지문이 필요 없는 유형이면 비워 두세요. 밑줄은 <u>…</u>로 감싸면 미리보기에서 밑줄로 표시됩니다." />
          </div>
          <div className="field">
            <label>발문</label>
            <input value={it.stem} onChange={(e) => onPatch({ stem: e.target.value })} />
          </div>
          <label style={{ fontSize: 13, color: "var(--muted)" }}>선지 · 정답(라디오)</label>
          <ChoiceEditor choices={it.choices} answerIndex={it.answerIndex} onChange={(choices, ai) => onPatch({ choices, answerIndex: ai ?? 0 })} />
          <div className="field" style={{ marginTop: 8, marginBottom: 0 }}>
            <label>해설</label>
            <input value={it.explanation} onChange={(e) => onPatch({ explanation: e.target.value })} />
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 8, lineHeight: 1.75 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>
            <span style={{ marginRight: 6 }}>{index + 1}.</span>
            <MarkedText text={it.stem} />
          </div>
          {it.passage.trim() && (
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: "12px 14px",
                margin: "10px 0",
                whiteSpace: "pre-wrap",
                background: "#fbfbfc",
              }}
            >
              <MarkedText text={it.passage} />
            </div>
          )}
          <div style={{ display: "grid", gap: 4, marginTop: 8 }}>
            {it.choices.map((c, k) => {
              const isAnswer = k === it.answerIndex;
              return (
                <div key={k} style={{ fontWeight: isAnswer ? 700 : 400, color: isAnswer ? "var(--primary)" : undefined }}>
                  {circled(k)} <MarkedText text={c} />
                </div>
              );
            })}
          </div>
          <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>
            정답 {circled(it.answerIndex)}
            {it.explanation.trim() ? ` · 해설: ${it.explanation}` : ""}
          </div>
        </div>
      )}
    </div>
  );
}

// ───────────────────── 공용: 문항 편집 핸들러(생성결과·보관함·시험지 공유) ─────────────────────

function setKindOf(spec: unknown): string | null {
  return (spec as { kind?: string } | null)?.kind ?? null;
}

/** DB 문항(QbankItem) → 편집용 ItemRow(원본 스냅샷·유형명 포함). */
function toItemRow(r: QbankItem, typeNameById: Map<string, string>): ItemRow {
  const base = {
    id: r.id,
    passage: r.passage ?? "",
    stem: r.stem,
    choices: r.choices.length ? r.choices : ["", ""],
    answerIndex: r.answer_index,
    explanation: r.explanation ?? "",
    typeId: r.type_id ?? null,
    typeName: r.type_id ? typeNameById.get(r.type_id) : undefined,
  };
  return { ...base, original: snapshot(base) };
}

function toSavedInput(it: ItemRow): SavedItemInput {
  return { id: it.id, passage: it.passage, stem: it.stem, choices: it.choices, answerIndex: it.answerIndex, explanation: it.explanation, typeId: it.typeId ?? null };
}

/** 문항별 편집(수정/유형변경/되돌리기/AI수정/삭제) 핸들러 묶음. */
function useItemEditing(
  items: ItemRow[],
  setItems: React.Dispatch<React.SetStateAction<ItemRow[]>>,
  types: QbankType[],
  difficulty: string,
  flash: (m: string) => void,
  fail: (e: unknown) => void,
) {
  const patchOne = (i: number, p: Partial<ItemRow>) => setItems((xs) => xs.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const deleteOne = (i: number) => setItems((xs) => xs.filter((_, k) => k !== i));
  const changeType = (i: number, typeId: string | null) => {
    const name = typeId ? types.find((t) => t.id === typeId)?.name : undefined;
    patchOne(i, { typeId, typeName: name });
  };
  const revertOne = (i: number) => {
    setItems((xs) =>
      xs.map((x, k) => {
        if (k !== i || !x.original) return x;
        const o = x.original;
        return { ...x, passage: o.passage, stem: o.stem, choices: [...o.choices], answerIndex: o.answerIndex, explanation: o.explanation, typeName: o.typeName, typeId: o.typeId ?? null, saved: false };
      }),
    );
    flash("문항을 처음 상태로 되돌렸어요.");
  };
  const refineOne = async (i: number, instruction: string): Promise<boolean> => {
    const it = items[i];
    if (!it) return false;
    try {
      const revised = await refineExamItem({
        typeId: it.typeId ?? null,
        item: { passage: it.passage, stem: it.stem, choices: it.choices, answerIndex: it.answerIndex, explanation: it.explanation },
        instruction,
        difficulty,
      });
      setItems((xs) => xs.map((x, k) => (k === i ? { ...x, passage: revised.passage, stem: revised.stem, choices: revised.choices, answerIndex: revised.answerIndex, explanation: revised.explanation, saved: false } : x)));
      flash("AI가 문항을 수정했어요.");
      return true;
    } catch (e) {
      fail(e);
      return false;
    }
  };
  return { patchOne, deleteOne, changeType, revertOne, refineOne };
}

// ───────────────────── 보관함 탭 ─────────────────────

function ArchiveTab({
  sets,
  setSets,
  types,
  typeNameById,
  busy,
  setBusy,
  flash,
  fail,
}: {
  sets: SetSummary[];
  setSets: React.Dispatch<React.SetStateAction<SetSummary[]>>;
  types: QbankType[];
  typeNameById: Map<string, string>;
  busy: boolean;
  setBusy: (b: boolean) => void;
  flash: (m: string) => void;
  fail: (e: unknown) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [items, setItems] = useState<ItemRow[]>([]);
  const [mode, setMode] = useState<"edit" | "preview">("edit");

  const ed = useItemEditing(items, setItems, types, "보통", flash, fail);
  const archiveSets = sets.filter((s) => setKindOf(s.spec) !== "exam");
  const papers = sets.filter((s) => setKindOf(s.spec) === "exam");

  async function open(id: string, t: string) {
    setBusy(true);
    try {
      const rows = await getSetItems(id);
      setItems(rows.map((r) => toItemRow(r, typeNameById)));
      setTitle(t);
      setMode("edit");
      setOpenId(id);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function autoAssignTypes() {
    const targets = items.map((it, i) => ({ it, i })).filter((x) => !x.it.typeId && x.it.stem.trim());
    if (types.length === 0) { flash("먼저 ‘기출 예시 → 유형 관리’에서 유형을 등록하세요."); return; }
    if (!targets.length) { flash("유형이 없는 문항이 없어요."); return; }
    setBusy(true);
    try {
      const res = await classifyExamItems(targets.map((t) => ({ passage: t.it.passage, stem: t.it.stem, choices: t.it.choices, explanation: t.it.explanation })));
      const assignByIndex = new Map(targets.map((t, k) => [t.i, res[k] ?? null]));
      setItems((xs) => xs.map((x, k) => {
        const typeId = assignByIndex.get(k);
        if (!typeId) return x;
        return { ...x, typeId, typeName: types.find((t) => t.id === typeId)?.name };
      }));
      const done = [...assignByIndex.values()].filter(Boolean).length;
      flash(`${done}개 문항에 유형을 배정했어요. ‘저장’을 눌러 반영하세요.`);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function addToPaper(i: number, paperId: string) {
    const it = items[i];
    if (!it || !it.stem.trim()) return;
    const paperTitle = papers.find((p) => p.id === paperId)?.title ?? "시험지";
    setBusy(true);
    try {
      await addItemsToPaper(paperId, [toSavedInput({ ...it, id: undefined })]);
      setSets((xs) => xs.map((s) => (s.id === paperId ? { ...s, itemCount: s.itemCount + 1 } : s)));
      ed.patchOne(i, { addedPapers: [...new Set([...(it.addedPapers ?? []), paperTitle])] });
      flash(`‘${paperTitle}’에 담았어요.`);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function createPaperAndAdd(i: number) {
    const it = items[i];
    if (!it || !it.stem.trim()) return;
    const name = window.prompt("새 시험지 제목", "새 시험지");
    if (name === null) return;
    setBusy(true);
    try {
      const paperTitle = name || "새 시험지";
      const id = await createPaper(paperTitle);
      const s: SetSummary = { id, teacher_id: "", title: paperTitle, passage: null, spec: { kind: "exam" }, shared: false, class_id: null, created_at: new Date().toISOString(), itemCount: 0 };
      setSets((xs) => [s, ...xs]);
      await addItemsToPaper(id, [toSavedInput({ ...it, id: undefined })]);
      setSets((xs) => xs.map((x) => (x.id === id ? { ...x, itemCount: 1 } : x)));
      ed.patchOne(i, { addedPapers: [...new Set([...(it.addedPapers ?? []), paperTitle])] });
      flash(`새 시험지 ‘${paperTitle}’에 담았어요.`);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!openId) return;
    setBusy(true);
    try {
      await updateSet(openId, title, items.map(toSavedInput));
      setSets((xs) => xs.map((s) => (s.id === openId ? { ...s, title: title.trim() || s.title, itemCount: items.filter((i) => i.stem.trim()).length } : s)));
      flash("저장됨");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string, t: string) {
    if (!confirm(`'${t}' 세트를 삭제할까요? (되돌릴 수 없음)`)) return;
    setBusy(true);
    try {
      await deleteSet(id);
      setSets((xs) => xs.filter((s) => s.id !== id));
      if (openId === id) setOpenId(null);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  if (openId) {
    return (
      <div>
        <div className="card row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div className="row" style={{ gap: 8, alignItems: "center", flex: 1 }}>
            <button type="button" className="btn secondary" onClick={() => setOpenId(null)}>← 목록</button>
            <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ flex: 1, maxWidth: 320 }} />
          </div>
          <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {mode === "edit" && (
              <button type="button" className="btn secondary" style={{ padding: "4px 10px", fontSize: 13 }} onClick={autoAssignTypes} disabled={busy} title="유형이 없는 문항을 AI가 유형별로 배정">AI 유형 자동 배정</button>
            )}
            <button type="button" className={`btn ${mode === "edit" ? "" : "secondary"}`} style={{ padding: "4px 10px", fontSize: 13 }} onClick={() => setMode("edit")}>편집</button>
            <button type="button" className={`btn ${mode === "preview" ? "" : "secondary"}`} style={{ padding: "4px 10px", fontSize: 13 }} onClick={() => setMode("preview")}>미리보기</button>
            <button type="button" className="btn" onClick={save} disabled={busy}>저장</button>
          </div>
        </div>

        {mode === "preview" ? (
          <>
            {title.trim() && <h2 style={{ textAlign: "center", margin: "6px 0 12px" }}>{title}</h2>}
            <ExamPreview items={items} />
          </>
        ) : (
          <>
            <p className="muted" style={{ fontSize: 12, margin: "0 0 10px" }}>각 문항을 바로 수정 · AI 수정 · 유형변경 · 되돌리기 · 삭제하고, <b>시험지에 담기</b>로 시험지에 넣을 수 있어요. 변경 후 <b>저장</b>하세요.</p>
            {items.map((it, i) => (
              <ResultItem
                key={it.id ?? i}
                index={i}
                it={it}
                types={types}
                busy={busy}
                onPatch={(p) => ed.patchOne(i, p)}
                onDelete={() => ed.deleteOne(i)}
                onChangeType={(id) => ed.changeType(i, id)}
                onRevert={() => ed.revertOne(i)}
                onRefine={(ins) => ed.refineOne(i, ins)}
                extraTools={
                  <select
                    value=""
                    disabled={busy}
                    title="이 문항을 시험지에 담기"
                    style={{ padding: "4px 6px" }}
                    onChange={(e) => { const v = e.target.value; if (v === "__new__") void createPaperAndAdd(i); else if (v) void addToPaper(i, v); }}
                  >
                    <option value="">시험지에 담기…</option>
                    {papers.map((p) => (
                      <option key={p.id} value={p.id}>{p.title}</option>
                    ))}
                    <option value="__new__">＋ 새 시험지…</option>
                  </select>
                }
              />
            ))}
            <button type="button" className="btn secondary" onClick={() => setItems((its) => [...its, { passage: "", stem: "", choices: ["", "", "", ""], answerIndex: 0, explanation: "" }])}>+ 문항 추가</button>
          </>
        )}
      </div>
    );
  }

  return (
    <div>
      {archiveSets.length === 0 && <div className="card muted">보관된 시험이 없습니다. “새 시험 생성”에서 만들어 저장하세요.</div>}
      {archiveSets.map((s) => (
        <div className="card" key={s.id}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{s.title}</div>
              <div className="muted" style={{ fontSize: 13 }}>{s.itemCount}문항 · {new Date(s.created_at).toLocaleDateString("ko-KR")}</div>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button type="button" className="btn secondary" onClick={() => void open(s.id, s.title)} disabled={busy}>열기</button>
              <button type="button" className="btn secondary" onClick={() => void remove(s.id, s.title)} disabled={busy}>삭제</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ───────────────────── 시험지 탭(보관함에서 담기·이동·공유) ─────────────────────

function PapersTab({
  sets,
  setSets,
  types,
  typeNameById,
  roster,
  busy,
  setBusy,
  flash,
  fail,
}: {
  sets: SetSummary[];
  setSets: React.Dispatch<React.SetStateAction<SetSummary[]>>;
  types: QbankType[];
  typeNameById: Map<string, string>;
  roster: RosterClass[];
  busy: boolean;
  setBusy: (b: boolean) => void;
  flash: (m: string) => void;
  fail: (e: unknown) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [items, setItems] = useState<ItemRow[]>([]);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [newTitle, setNewTitle] = useState("");
  // 담기/공유 패널
  const [pickerOpen, setPickerOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [distClasses, setDistClasses] = useState<Set<string>>(new Set());
  const [distStudents, setDistStudents] = useState<Set<string>>(new Set());
  const [shared, setShared] = useState(false);

  const ed = useItemEditing(items, setItems, types, "보통", flash, fail);
  const papers = sets.filter((s) => setKindOf(s.spec) === "exam");
  const archiveSets = sets.filter((s) => setKindOf(s.spec) !== "exam");
  const openPaper = papers.find((p) => p.id === openId) ?? null;

  async function reload(id: string) {
    const rows = await getSetItems(id);
    setItems(rows.map((r) => toItemRow(r, typeNameById)));
    setSets((xs) => xs.map((s) => (s.id === id ? { ...s, itemCount: rows.filter((r) => r.stem.trim()).length } : s)));
  }

  async function open(id: string, t: string, sh: boolean) {
    setBusy(true);
    try {
      const [rows, dist] = await Promise.all([getSetItems(id), getQbankDistributions(id)]);
      setItems(rows.map((r) => toItemRow(r, typeNameById)));
      setTitle(t);
      setShared(sh);
      setDistClasses(new Set(dist.classIds));
      setDistStudents(new Set(dist.studentIds));
      setMode("edit");
      setPickerOpen(false);
      setShareOpen(false);
      setOpenId(id);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    if (!newTitle.trim()) return;
    setBusy(true);
    try {
      const id = await createPaper(newTitle);
      const s: SetSummary = { id, teacher_id: "", title: newTitle.trim(), passage: null, spec: { kind: "exam" }, shared: false, class_id: null, created_at: new Date().toISOString(), itemCount: 0 };
      setSets((xs) => [s, ...xs]);
      setNewTitle("");
      await open(id, s.title, false);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!openId) return;
    setBusy(true);
    try {
      await updateSet(openId, title, items.map(toSavedInput));
      setSets((xs) => xs.map((s) => (s.id === openId ? { ...s, title: title.trim() || s.title, itemCount: items.filter((i) => i.stem.trim()).length } : s)));
      flash("저장됨");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string, t: string) {
    if (!confirm(`'${t}' 시험지를 삭제할까요? (되돌릴 수 없음)`)) return;
    setBusy(true);
    try {
      await deleteSet(id);
      setSets((xs) => xs.filter((s) => s.id !== id));
      if (openId === id) setOpenId(null);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  // 구조 변경(담기/이동): 현재 편집분을 먼저 저장 → 작업 → 재로드(일관성 보장)
  async function structuralOp(fn: () => Promise<void>) {
    if (!openId) return;
    setBusy(true);
    try {
      await updateSet(openId, title, items.map(toSavedInput));
      await fn();
      await reload(openId);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  function reorder(i: number, dir: -1 | 1) {
    setItems((xs) => {
      const j = i + dir;
      if (j < 0 || j >= xs.length) return xs;
      const next = xs.slice();
      const a = next[i]!;
      next[i] = next[j]!;
      next[j] = a;
      return next;
    });
  }

  async function moveTo(i: number, targetId: string) {
    const id = items[i]?.id;
    if (!id) {
      flash("이동하려면 먼저 저장하세요.");
      return;
    }
    await structuralOp(async () => {
      await moveItemsToPaper([id], targetId);
      setSets((xs) => xs.map((s) => (s.id === targetId ? { ...s, itemCount: s.itemCount + 1 } : s)));
    });
    flash("다른 시험지로 옮겼어요.");
  }

  async function saveShare() {
    if (!openId) return;
    setBusy(true);
    try {
      await setQbankDistributions(openId, [...distClasses], [...distStudents]);
      await setQbankShared(openId, shared);
      setSets((xs) => xs.map((s) => (s.id === openId ? { ...s, shared } : s)));
      flash(shared ? "학생에게 공유했어요." : "공유를 해제했어요.");
      setShareOpen(false);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  function toggleClass(id: string) {
    setDistClasses((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleStudent(id: string) {
    setDistStudents((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  // ── 시험지 목록 ──
  if (!openId || !openPaper) {
    return (
      <div>
        <div className="card">
          <b>새 시험지</b>
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="시험지 제목 (예: 1학기 중간 대비)" style={{ flex: 1, maxWidth: 320 }} onKeyDown={(e) => { if (e.key === "Enter") void create(); }} />
            <button type="button" className="btn" onClick={create} disabled={busy || !newTitle.trim()}>만들기</button>
          </div>
          <p className="muted" style={{ fontSize: 12, margin: "8px 0 0" }}>시험지를 만든 뒤 “보관함에서 담기”로 문항을 넣고, 문항을 재정렬·이동하고, “공유하기”로 학생에게 배부하세요.</p>
        </div>
        {papers.length === 0 && <div className="card muted">아직 시험지가 없습니다. 위에서 만들어 보세요.</div>}
        {papers.map((s) => (
          <div className="card" key={s.id}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>
                  {s.title}
                  {s.shared ? <span className="badge" style={{ marginLeft: 8, background: "var(--primary)", color: "#fff" }}>공유됨</span> : null}
                </div>
                <div className="muted" style={{ fontSize: 13 }}>{s.itemCount}문항 · {new Date(s.created_at).toLocaleDateString("ko-KR")}</div>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <button type="button" className="btn secondary" onClick={() => void open(s.id, s.title, s.shared)} disabled={busy}>열기</button>
                <button type="button" className="btn secondary" onClick={() => void remove(s.id, s.title)} disabled={busy}>삭제</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ── 시험지 편집 ──
  return (
    <div>
      <div className="card row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div className="row" style={{ gap: 8, alignItems: "center", flex: 1, minWidth: 240 }}>
          <button type="button" className="btn secondary" onClick={() => setOpenId(null)}>← 목록</button>
          <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ flex: 1, maxWidth: 320 }} />
        </div>
        <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" className={`btn ${mode === "edit" ? "" : "secondary"}`} style={{ padding: "4px 10px", fontSize: 13 }} onClick={() => setMode("edit")}>편집</button>
          <button type="button" className={`btn ${mode === "preview" ? "" : "secondary"}`} style={{ padding: "4px 10px", fontSize: 13 }} onClick={() => setMode("preview")}>미리보기</button>
          <button type="button" className="btn secondary" onClick={() => setPickerOpen((v) => !v)} disabled={busy}>＋ 보관함에서 담기</button>
          <button type="button" className={`btn ${shareOpen ? "" : "secondary"}`} onClick={() => setShareOpen((v) => !v)}>공유하기</button>
          <button type="button" className="btn" onClick={save} disabled={busy}>저장</button>
        </div>
      </div>

      {shareOpen && (
        <div className="card">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <b>학생 공유</b>
            <label style={{ fontWeight: 600 }}>
              <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} /> 공개(학생에게 노출)
            </label>
          </div>
          <p className="muted" style={{ fontSize: 12, margin: "4px 0 8px" }}>반 전체 또는 개별 학생에게 배부합니다. <b>공개</b>가 켜져야 학생에게 보입니다. 학생은 풀고 ‘채점’하면 정답·해설을 봅니다.</p>
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
          <button type="button" className="btn" onClick={saveShare} disabled={busy}>공유 저장</button>
        </div>
      )}

      {pickerOpen && (
        <ArchivePicker archiveSets={archiveSets} typeNameById={typeNameById} busy={busy} onAdd={(snap) => void structuralOp(() => addItemsToPaper(openId, [snap]))} fail={fail} />
      )}

      {mode === "preview" ? (
        <>
          {title.trim() && <h2 style={{ textAlign: "center", margin: "6px 0 12px" }}>{title}</h2>}
          <ExamPreview items={items} />
        </>
      ) : items.length === 0 ? (
        <div className="card muted">아직 문항이 없습니다. “＋ 보관함에서 담기”로 보관함 문항을 담으세요.</div>
      ) : (
        items.map((it, i) => (
          <ResultItem
            key={it.id ?? i}
            index={i}
            it={it}
            types={types}
            busy={busy}
            onPatch={(p) => ed.patchOne(i, p)}
            onDelete={() => ed.deleteOne(i)}
            onChangeType={(id) => ed.changeType(i, id)}
            onRevert={() => ed.revertOne(i)}
            onRefine={(ins) => ed.refineOne(i, ins)}
            extraTools={
              <>
                <button type="button" className="btn secondary" style={{ padding: "4px 8px" }} disabled={busy || i === 0} title="위로" onClick={() => reorder(i, -1)}>↑</button>
                <button type="button" className="btn secondary" style={{ padding: "4px 8px" }} disabled={busy || i === items.length - 1} title="아래로" onClick={() => reorder(i, 1)}>↓</button>
                {papers.filter((p) => p.id !== openId).length > 0 && (
                  <select
                    value=""
                    disabled={busy}
                    title="다른 시험지로 이동"
                    style={{ padding: "4px 6px" }}
                    onChange={(e) => { const t = e.target.value; if (t) void moveTo(i, t); }}
                  >
                    <option value="">이동…</option>
                    {papers.filter((p) => p.id !== openId).map((p) => (
                      <option key={p.id} value={p.id}>{p.title}</option>
                    ))}
                  </select>
                )}
              </>
            }
          />
        ))
      )}
    </div>
  );
}

// 보관함 문항을 시험지로 담는 선택 패널
function ArchivePicker({
  archiveSets,
  typeNameById,
  busy,
  onAdd,
  fail,
}: {
  archiveSets: SetSummary[];
  typeNameById: Map<string, string>;
  busy: boolean;
  onAdd: (item: SavedItemInput) => void;
  fail: (e: unknown) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rows, setRows] = useState<ItemRow[]>([]);
  const [loading, setLoading] = useState(false);

  async function expand(id: string) {
    if (expandedId === id) { setExpandedId(null); setRows([]); return; }
    setLoading(true);
    try {
      const data = await getSetItems(id);
      setRows(data.map((r) => toItemRow(r, typeNameById)));
      setExpandedId(id);
    } catch (e) {
      fail(e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <b>보관함에서 담기</b>
      <p className="muted" style={{ fontSize: 12, margin: "4px 0 8px" }}>보관함 세트를 펼쳐 원하는 문항을 이 시험지에 담습니다(복사).</p>
      {archiveSets.length === 0 && <div className="muted">보관함에 문항이 없습니다.</div>}
      {archiveSets.map((s) => (
        <div key={s.id} style={{ borderBottom: "1px solid var(--border)", padding: "6px 0" }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <span>{s.title} <span className="muted" style={{ fontSize: 12 }}>({s.itemCount}문항)</span></span>
            <button type="button" className="btn secondary" style={{ padding: "4px 10px", fontSize: 13 }} onClick={() => void expand(s.id)} disabled={loading}>{expandedId === s.id ? "접기" : "펼치기"}</button>
          </div>
          {expandedId === s.id && (
            <div style={{ marginTop: 6, display: "grid", gap: 6 }}>
              {rows.map((r, i) => (
                <div key={r.id ?? i} className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 8, background: "#fafafa", padding: "6px 8px", borderRadius: 6 }}>
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {i + 1}. {r.stem || "(발문 없음)"}{r.typeName ? ` · ${r.typeName}` : ""}
                  </span>
                  <button type="button" className="btn" style={{ padding: "4px 10px", fontSize: 13, whiteSpace: "nowrap" }} disabled={busy} onClick={() => onAdd(toSavedInput({ ...r, id: undefined }))}>담기</button>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
