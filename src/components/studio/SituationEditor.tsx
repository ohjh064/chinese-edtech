"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  saveSituation,
  deleteSituation,
  generateSituation,
  type ExpressionRow,
  type QuestionRow,
  type SentenceRow,
} from "@/app/actions/studio";
import { toDisplayWord } from "@/grading/pinyin.js";
import type { Difficulty, Situation } from "@/lib/database.types";

async function loadSuggest() {
  const mod = await import("@/lib/pinyin-suggest");
  return mod.suggestFromHanzi;
}

export function SituationEditor({
  unitId,
  unitTheme,
  situation,
  initialExpressions,
  initialQuestions,
  initialSentenceItems,
  initialBoss,
}: {
  unitId: string;
  unitTheme: string;
  situation: Situation;
  initialExpressions: ExpressionRow[];
  initialQuestions: QuestionRow[];
  initialSentenceItems: SentenceRow[];
  initialBoss: { description: string; steps: string };
}) {
  const router = useRouter();
  const [title, setTitle] = useState(situation.title);
  const [description, setDescription] = useState(situation.description ?? "");
  const [roleStudent, setRoleStudent] = useState(situation.role_student ?? "");
  const [roleAi, setRoleAi] = useState(situation.role_ai ?? "");
  const [difficulty, setDifficulty] = useState<Difficulty>(situation.difficulty);
  const [exprs, setExprs] = useState<ExpressionRow[]>(
    initialExpressions.length ? initialExpressions : [{ hanzi: "", pinyin: "", meaning: "" }],
  );
  const [questions, setQuestions] = useState<QuestionRow[]>(
    initialQuestions.length ? initialQuestions : [{ promptZh: "", promptKo: "", modelAnswerZh: "", modelAnswerKo: "" }],
  );
  const [sentences, setSentences] = useState<SentenceRow[]>(initialSentenceItems);
  const [bossDescription, setBossDescription] = useState(initialBoss.description);
  const [bossSteps, setBossSteps] = useState(initialBoss.steps);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // AI 생성 패널
  const [genDesc, setGenDesc] = useState("");
  const [generating, setGenerating] = useState(false);

  function upExpr(i: number, patch: Partial<ExpressionRow>) {
    setExprs((xs) => xs.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }
  function upQ(i: number, patch: Partial<QuestionRow>) {
    setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  }
  async function fillPinyin(i: number) {
    const hanzi = exprs[i]?.hanzi.trim();
    if (!hanzi) return;
    const suggest = await loadSuggest();
    const s = suggest(hanzi);
    if (s.pinyin) upExpr(i, { pinyin: toDisplayWord(s.pinyin, s.tones) });
  }

  async function runGenerate() {
    if (!genDesc.trim()) {
      setError("상황 설명을 입력하세요.");
      return;
    }
    if (
      (exprs.some((e) => e.hanzi.trim()) || questions.some((q) => q.promptZh.trim())) &&
      !confirm("현재 입력 내용을 AI 생성 결과로 덮어쓸까요?")
    ) {
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const r = await generateSituation({ unitTheme, description: genDesc, difficulty });
      setTitle(r.title || title);
      setDescription(r.description);
      setRoleStudent(r.roleStudent);
      setRoleAi(r.roleAi);
      setExprs(r.expressions.length ? r.expressions : exprs);
      setQuestions(r.questions.length ? r.questions : questions);
      if (r.sentenceItems.length) setSentences(r.sentenceItems);
      if (r.bossDescription) setBossDescription(r.bossDescription);
      if (r.bossSteps) setBossSteps(r.bossSteps);
      setMsg("AI 초안 생성됨 — 검토·수정 후 저장하세요.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "생성 실패");
    } finally {
      setGenerating(false);
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      await saveSituation(situation.id, {
        unitId,
        title: title.trim() || "새 상황",
        description: description.trim() || null,
        roleStudent: roleStudent.trim() || null,
        roleAi: roleAi.trim() || null,
        difficulty,
        expressions: exprs,
        questions,
        sentenceItems: sentences,
        bossDescription,
        bossSteps,
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
    if (!confirm("이 상황을 삭제할까요?")) return;
    setBusy(true);
    try {
      await deleteSituation(situation.id, unitId);
    } catch (e) {
      if (e && typeof e === "object" && "digest" in e) return;
      setError(e instanceof Error ? e.message : "삭제 실패");
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="card" style={{ background: "var(--primary-weak)" }}>
        <b>AI로 상황 생성 (§15)</b>
        <p className="muted" style={{ fontSize: 13, margin: "4px 0 8px" }}>
          상황을 한국어로 설명하면 핵심표현·질문·모범답안 초안을 만들어 아래 양식을 채웁니다(검토 후 저장).
        </p>
        <textarea rows={2} value={genDesc} onChange={(e) => setGenDesc(e.target.value)} placeholder="예: 편의점에서 물건 사고 QR로 결제하기" disabled={generating} />
        <div className="row" style={{ marginTop: 8, alignItems: "center" }}>
          <button className="btn" type="button" onClick={runGenerate} disabled={generating}>
            {generating ? "생성 중…" : "AI로 생성"}
          </button>
          <span className="muted" style={{ fontSize: 12 }}>난이도: {difficulty}</span>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>상황 정보</h3>
        <div className="field">
          <label>제목</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label>설명</label>
          <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="row">
          <div className="field grow">
            <label>학생 역할</label>
            <input value={roleStudent} onChange={(e) => setRoleStudent(e.target.value)} placeholder="손님" />
          </div>
          <div className="field grow">
            <label>AI 역할</label>
            <input value={roleAi} onChange={(e) => setRoleAi(e.target.value)} placeholder="점원" />
          </div>
          <div className="field" style={{ width: 120 }}>
            <label>난이도</label>
            <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)}>
              <option value="easy">Easy</option>
              <option value="normal">Normal</option>
              <option value="hard">Hard</option>
            </select>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>핵심 표현</h3>
        {exprs.map((e, i) => (
          <div className="row" key={i} style={{ alignItems: "flex-end" }}>
            <div className="field" style={{ width: 110 }}>
              <label>한자</label>
              <input value={e.hanzi} onChange={(ev) => upExpr(i, { hanzi: ev.target.value })} onBlur={() => fillPinyin(i)} />
            </div>
            <div className="field grow">
              <label>병음</label>
              <input value={e.pinyin} onChange={(ev) => upExpr(i, { pinyin: ev.target.value })} />
            </div>
            <div className="field grow">
              <label>뜻</label>
              <input value={e.meaning} onChange={(ev) => upExpr(i, { meaning: ev.target.value })} />
            </div>
            <button type="button" className="btn secondary" onClick={() => setExprs((xs) => xs.filter((_, idx) => idx !== i))}>삭제</button>
          </div>
        ))}
        <button type="button" className="btn secondary" onClick={() => setExprs((xs) => [...xs, { hanzi: "", pinyin: "", meaning: "" }])}>+ 표현 추가</button>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>질문 / 모범답안</h3>
        <p className="muted" style={{ fontSize: 12 }}>모범답안은 학생에게 보이지 않고 AI 피드백(Phase 2)에 사용됩니다.</p>
        {questions.map((q, i) => (
          <div className="card" key={i} style={{ background: "#fafafa" }}>
            <div className="row">
              <div className="field grow">
                <label>질문(중국어)</label>
                <input value={q.promptZh} onChange={(ev) => upQ(i, { promptZh: ev.target.value })} placeholder="你喜欢辣的吗？" />
              </div>
              <div className="field grow">
                <label>질문(한국어)</label>
                <input value={q.promptKo} onChange={(ev) => upQ(i, { promptKo: ev.target.value })} />
              </div>
            </div>
            <div className="row">
              <div className="field grow">
                <label>모범답안(중국어)</label>
                <input value={q.modelAnswerZh} onChange={(ev) => upQ(i, { modelAnswerZh: ev.target.value })} placeholder="我喜欢吃饺子。" />
              </div>
              <div className="field grow">
                <label>모범답안(한국어)</label>
                <input value={q.modelAnswerKo} onChange={(ev) => upQ(i, { modelAnswerKo: ev.target.value })} />
              </div>
              <button type="button" className="btn secondary" style={{ alignSelf: "flex-end" }} onClick={() => setQuestions((qs) => qs.filter((_, idx) => idx !== i))}>삭제</button>
            </div>
          </div>
        ))}
        <button type="button" className="btn secondary" onClick={() => setQuestions((qs) => [...qs, { promptZh: "", promptKo: "", modelAnswerZh: "", modelAnswerKo: "" }])}>+ 질문 추가</button>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>문장 배열 문제 (Sentence Builder)</h3>
        <p className="muted" style={{ fontSize: 12 }}>토큰(단어)은 공백 또는 &quot;/&quot;로 구분하세요. 학생은 셔플된 토큰을 순서대로 배열합니다.</p>
        {sentences.map((s, i) => {
          const up = (patch: Partial<SentenceRow>) => setSentences((xs) => xs.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
          return (
            <div className="card" key={i} style={{ background: "#fafafa" }}>
              <div className="row">
                <div className="field grow"><label>정답 문장</label><input value={s.targetZh} onChange={(e) => up({ targetZh: e.target.value })} placeholder="我是学生。" /></div>
                <div className="field grow"><label>한국어 뜻</label><input value={s.targetKo} onChange={(e) => up({ targetKo: e.target.value })} placeholder="나는 학생이다." /></div>
                <div className="field" style={{ width: 110 }}>
                  <label>난이도</label>
                  <select value={s.difficulty} onChange={(e) => up({ difficulty: e.target.value as Difficulty })}>
                    <option value="easy">Easy</option><option value="normal">Normal</option><option value="hard">Hard</option>
                  </select>
                </div>
              </div>
              <div className="row" style={{ alignItems: "flex-end" }}>
                <div className="field grow"><label>토큰(단어, 공백/&quot;/&quot; 구분)</label><input value={s.tokens} onChange={(e) => up({ tokens: e.target.value })} placeholder="我 / 是 / 学生" /></div>
                <button type="button" className="btn secondary" onClick={() => setSentences((xs) => xs.filter((_, idx) => idx !== i))}>삭제</button>
              </div>
            </div>
          );
        })}
        <button type="button" className="btn secondary" onClick={() => setSentences((xs) => [...xs, { targetZh: "", targetKo: "", tokens: "", difficulty }])}>+ 문장 추가</button>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Boss Mission</h3>
        <div className="field"><label>미션 설명</label><textarea rows={2} value={bossDescription} onChange={(e) => setBossDescription(e.target.value)} placeholder="중국 음식점에서 주문부터 계산까지 수행하기" /></div>
        <div className="field"><label>미션 단계 (한 줄에 하나)</label><textarea rows={4} value={bossSteps} onChange={(e) => setBossSteps(e.target.value)} placeholder={"자리 안내 받기\n메뉴 주문하기\n추가 주문하기\n맛 표현하기\n계산하기"} /></div>
      </div>

      {error && <p className="error">{error}</p>}
      <div className="row" style={{ alignItems: "center" }}>
        <button className="btn" type="button" onClick={save} disabled={busy}>저장</button>
        <button className="btn secondary" type="button" onClick={remove} disabled={busy}>상황 삭제</button>
        {msg && <span className="ok" style={{ fontSize: 13 }}>{msg}</span>}
      </div>
    </div>
  );
}
