"use client";

import { useState } from "react";
import {
  createAssessment,
  type WordInput,
} from "@/app/actions/teacher";
import { AiGenerateWords } from "@/components/AiGenerateWords";
import { toDisplayWord } from "@/grading/pinyin.js";
import type { ClassRow } from "@/lib/database.types";

// pinyin-pro 사전은 무거우므로 자동추천을 처음 쓸 때만 동적 로드(초기 번들 경량화)
async function loadSuggest() {
  const mod = await import("@/lib/pinyin-suggest");
  return mod.suggestFromHanzi;
}

const emptyWord = (): WordInput => ({
  hanzi: "",
  correctPinyin: "",
  correctTones: "",
  acceptableMeanings: "",
  exampleSentence: "",
  errorPrompt: "",
  acceptableCorrections: "",
  judgeIsGrammatical: true,
  explanation: "",
});

export function NewAssessmentForm({
  classes,
  hasKey,
}: {
  classes: ClassRow[];
  hasKey: boolean;
}) {
  const [title, setTitle] = useState("");
  const [unit, setUnit] = useState("1. 你好");
  const [classId, setClassId] = useState(classes[0]?.id ?? "");
  const [mode, setMode] = useState<"exam" | "practice">("exam");
  const [sentenceTaskType, setSentenceTaskType] = useState<"compose" | "find_error" | "judge">("compose");
  const [pinyinErrorUnit, setPinyinErrorUnit] = useState<"initial_final" | "syllable" | "word">("initial_final");
  const [meaningPartialWeight, setMeaningPartialWeight] = useState("1");
  const [timeLimitMin, setTimeLimitMin] = useState("");
  const [attempts, setAttempts] = useState("1");
  const [reveal, setReveal] = useState(true);
  const [proctoring, setProctoring] = useState(false);
  const [allowPractice, setAllowPractice] = useState(false);
  const [words, setWords] = useState<WordInput[]>([emptyWord(), emptyWord()]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function updateWord(i: number, patch: Partial<WordInput>) {
    setWords((ws) => ws.map((w, idx) => (idx === i ? { ...w, ...patch } : w)));
  }

  /** AI 생성 결과를 기존 채워진 단어 뒤에 추가(빈 기본 행은 정리) */
  function handleGenerated(generated: WordInput[]) {
    setWords((ws) => {
      const filled = ws.filter((w) => w.hanzi.trim() && w.correctPinyin.trim());
      return [...filled, ...generated];
    });
  }

  /** 한자→병음·성조 자동 채움(교사 확인·수정 가능). overwrite=false면 비어있을 때만. */
  async function fillRow(i: number, overwrite = true) {
    const hanzi = words[i]?.hanzi.trim();
    if (!hanzi) return;
    if (!overwrite && words[i]?.correctPinyin.trim()) return;
    const suggestFromHanzi = await loadSuggest();
    const s = suggestFromHanzi(hanzi);
    if (!s.pinyin) return;
    updateWord(i, { correctPinyin: s.pinyin, correctTones: s.tones.join(" ") });
  }

  async function fillAll() {
    const suggestFromHanzi = await loadSuggest();
    setWords((ws) =>
      ws.map((w) => {
        if (!w.hanzi.trim()) return w;
        const s = suggestFromHanzi(w.hanzi);
        if (!s.pinyin) return w;
        return { ...w, correctPinyin: s.pinyin, correctTones: s.tones.join(" ") };
      }),
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const filled = words.filter((w) => w.hanzi.trim() && w.correctPinyin.trim());
    if (!title.trim()) return setError("평가 제목을 입력하세요.");
    if (filled.length === 0) return setError("최소 1개 단어를 입력하세요.");
    setSaving(true);
    try {
      await createAssessment({
        title: title.trim(),
        unit: unit.trim() || undefined,
        classId: classId || null,
        mode,
        sentenceTaskType,
        pinyinErrorUnit,
        meaningPartialWeight: Number(meaningPartialWeight),
        timeLimitSec: timeLimitMin ? Number(timeLimitMin) * 60 : null,
        attemptsAllowed: Number(attempts) || 1,
        revealAnswersInPractice: reveal,
        proctoring,
        allowPractice,
        words: filled,
      });
      // 성공 시 서버 액션이 리다이렉트
    } catch (err) {
      // redirect()는 예외로 던져지므로 무시
      if (err && typeof err === "object" && "digest" in err) return;
      setError(err instanceof Error ? err.message : "저장 실패");
      setSaving(false);
    }
  }

  return (
    <div className="container">
      <h1>새 평가 출제</h1>
      <form onSubmit={handleSubmit}>
        <div className="card">
          <div className="row">
            <div className="field grow">
              <label>제목</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="1과 어휘 수행평가" />
            </div>
            <div className="field grow">
              <label>단원</label>
              <input value={unit} onChange={(e) => setUnit(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>대상 반</label>
            {classes.length === 0 ? (
              <p className="error" style={{ margin: 0 }}>
                반이 없습니다. 먼저{" "}
                <a href="/teacher/classes">반·학생 관리</a>에서 반을 만들어야 학생에게 노출됩니다.
              </p>
            ) : (
              <select value={classId} onChange={(e) => setClassId(e.target.value)}>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="row">
            <div className="field grow">
              <label>유형</label>
              <select value={mode} onChange={(e) => setMode(e.target.value as "exam" | "practice")}>
                <option value="exam">평가(응시)</option>
                <option value="practice">연습</option>
              </select>
            </div>
            <div className="field grow">
              <label>제한시간(분, 비우면 무제한)</label>
              <input value={timeLimitMin} onChange={(e) => setTimeLimitMin(e.target.value)} type="number" min={0} />
            </div>
            <div className="field grow">
              <label>응시 허용 횟수</label>
              <input value={attempts} onChange={(e) => setAttempts(e.target.value)} type="number" min={1} />
            </div>
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>채점 옵션 (PRD §15)</h3>
          <div className="row">
            <div className="field grow">
              <label>병음 오류 카운트 단위</label>
              <select value={pinyinErrorUnit} onChange={(e) => setPinyinErrorUnit(e.target.value as typeof pinyinErrorUnit)}>
                <option value="initial_final">성모·운모 각각 (권장)</option>
                <option value="syllable">음절당 1개</option>
                <option value="word">단어당 1개</option>
              </select>
            </div>
            <div className="field grow">
              <label>문장(오류판단) 과제 유형</label>
              <select value={sentenceTaskType} onChange={(e) => setSentenceTaskType(e.target.value as typeof sentenceTaskType)}>
                <option value="compose">작문형 (권장)</option>
                <option value="find_error">오류 찾기형</option>
                <option value="judge">어법 판단형 (O/X)</option>
              </select>
            </div>
            <div className="field grow">
              <label>의미 부분정답 가중치</label>
              <select value={meaningPartialWeight} onChange={(e) => setMeaningPartialWeight(e.target.value)}>
                <option value="1">부분정답도 1개 (권장)</option>
                <option value="0.5">부분정답 0.5개</option>
              </select>
            </div>
          </div>
          <div className="row">
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="checkbox" style={{ width: "auto" }} checked={reveal} onChange={(e) => setReveal(e.target.checked)} />
              연습 모드에서 정답 즉시 공개
            </label>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="checkbox" style={{ width: "auto" }} checked={proctoring} onChange={(e) => setProctoring(e.target.checked)} />
              응시 통제(탭 이탈 감지)
            </label>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="checkbox" style={{ width: "auto" }} checked={allowPractice} onChange={(e) => setAllowPractice(e.target.checked)} />
              학생 연습 허용(연습 모드 + AI 피드백)
            </label>
          </div>
        </div>

        <AiGenerateWords
          hasKey={hasKey}
          sentenceTaskType={sentenceTaskType}
          onGenerated={handleGenerated}
        />

        <div className="card">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0 }}>단어 정답키</h3>
            <button type="button" className="btn secondary" onClick={fillAll}>
              한자에서 병음·성조 전체 자동 채움
            </button>
          </div>
          <p className="muted" style={{ fontSize: 13 }}>
            한자를 입력하면 병음·성조가 자동 추천됩니다(확인·수정 가능). 병음은 음절 공백 구분(예:{" "}
            <code>ni hao</code>), 성조는 숫자 공백 구분(예: <code>3 3</code>). 의미는 쉼표로 여러 정답 허용.
          </p>
          {words.map((w, i) => (
            <div key={i} className="card" style={{ background: "#fafafa" }}>
              <div className="row">
                <div className="field" style={{ width: 90 }}>
                  <label>한자</label>
                  <input
                    value={w.hanzi}
                    onChange={(e) => updateWord(i, { hanzi: e.target.value })}
                    onBlur={() => fillRow(i, false)}
                  />
                </div>
                <div className="field grow">
                  <label>병음(성조 제외)</label>
                  <input value={w.correctPinyin} onChange={(e) => updateWord(i, { correctPinyin: e.target.value })} placeholder="ni hao" />
                </div>
                <div className="field" style={{ width: 110 }}>
                  <label>성조</label>
                  <input value={w.correctTones} onChange={(e) => updateWord(i, { correctTones: e.target.value })} placeholder="3 3" />
                </div>
                <div className="field" style={{ width: 64, display: "flex", alignItems: "flex-end" }}>
                  <button type="button" className="btn secondary" onClick={() => fillRow(i, true)} title="한자에서 병음·성조 채우기">
                    자동
                  </button>
                </div>
              </div>
              <div className="row">
                <div className="field grow">
                  <label>허용 의미(쉼표 구분)</label>
                  <input value={w.acceptableMeanings} onChange={(e) => updateWord(i, { acceptableMeanings: e.target.value })} placeholder="안녕, 안녕하세요" />
                </div>
                {sentenceTaskType === "compose" && (
                  <div className="field grow">
                    <label>예문(선택)</label>
                    <input value={w.exampleSentence ?? ""} onChange={(e) => updateWord(i, { exampleSentence: e.target.value })} />
                  </div>
                )}
              </div>
              {sentenceTaskType === "find_error" && (
                <div className="row">
                  <div className="field grow">
                    <label>제시 오류 문장(학생에게 보임)</label>
                    <input value={w.errorPrompt ?? ""} onChange={(e) => updateWord(i, { errorPrompt: e.target.value })} placeholder="我是学生吗。" />
                  </div>
                  <div className="field grow">
                    <label>정답(수정) 문장 — 여러 개는 / 로 구분</label>
                    <input value={w.acceptableCorrections ?? ""} onChange={(e) => updateWord(i, { acceptableCorrections: e.target.value })} placeholder="我是学生。/ 我是学生" />
                  </div>
                </div>
              )}
              {sentenceTaskType === "judge" && (
                <div className="row" style={{ alignItems: "flex-end" }}>
                  <div className="field grow">
                    <label>판단할 문장(학생에게 보임)</label>
                    <input value={w.errorPrompt ?? ""} onChange={(e) => updateWord(i, { errorPrompt: e.target.value })} placeholder={`${w.hanzi || "단어"}(을)를 활용한 문장`} />
                  </div>
                  <div className="field" style={{ width: 150 }}>
                    <label>정답(어법)</label>
                    <select value={w.judgeIsGrammatical ? "O" : "X"} onChange={(e) => updateWord(i, { judgeIsGrammatical: e.target.value === "O" })}>
                      <option value="O">맞음(O)</option>
                      <option value="X">안 맞음(X)</option>
                    </select>
                  </div>
                  <div className="field grow">
                    <label>해설(선택)</label>
                    <input value={w.explanation ?? ""} onChange={(e) => updateWord(i, { explanation: e.target.value })} placeholder="왜 맞는지/틀린지" />
                  </div>
                </div>
              )}
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <span className="pill-preview muted">
                  미리보기: {w.correctPinyin ? toDisplayWord(w.correctPinyin, w.correctTones.split(/[\s,]+/).filter(Boolean).map(Number)) : "—"}
                </span>
                <button type="button" className="btn secondary" onClick={() => setWords((ws) => ws.filter((_, idx) => idx !== i))}>
                  삭제
                </button>
              </div>
            </div>
          ))}
          <button type="button" className="btn secondary" onClick={() => setWords((ws) => [...ws, emptyWord()])}>
            + 단어 추가
          </button>
        </div>

        {error && <p className="error">{error}</p>}
        <button className="btn" type="submit" disabled={saving}>
          {saving ? "저장 중…" : "평가 저장(초안)"}
        </button>
      </form>
    </div>
  );
}
