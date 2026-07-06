"use client";

/**
 * 생성/보관 문항을 실제 기출 시험지 스타일로 렌더(읽기 전용 미리보기).
 * 문항 번호 · 발문 · 제시문 박스 · ①②③④⑤ 선지 · (교사용) 정답 강조/해설.
 */
export interface PreviewItem {
  passage: string;
  stem: string;
  choices: string[];
  answerIndex: number;
  explanation: string;
}

const CIRCLED = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];
export function circled(i: number): string {
  return i >= 0 && i < CIRCLED.length ? CIRCLED[i]! : `(${i + 1})`;
}

/**
 * `<u>…</u>` 마크업만 실제 밑줄로 렌더(나머지는 그대로 텍스트 — XSS 안전).
 * "밑줄 친 부분" 유형에서 밑줄 대상을 보이게 한다.
 */
export function MarkedText({ text }: { text: string }) {
  if (!text.includes("<u>")) return <>{text}</>;
  const parts: (string | React.JSX.Element)[] = [];
  const re = /<u>([\s\S]*?)<\/u>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(
      <u key={key++} style={{ textDecoration: "underline", textUnderlineOffset: 2 }}>
        {m[1]}
      </u>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

export function ExamPreview({
  items,
  showAnswers = true,
}: {
  items: PreviewItem[];
  showAnswers?: boolean;
}) {
  if (!items.length) return <div className="card muted">미리볼 문항이 없습니다.</div>;
  return (
    <div className="card" style={{ background: "#fff", lineHeight: 1.75, padding: "20px 22px" }}>
      {items.map((it, i) => (
        <div
          key={i}
          style={{
            marginBottom: 22,
            paddingBottom: 18,
            borderBottom: i < items.length - 1 ? "1px dashed var(--border)" : "none",
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 16 }}>
            <span style={{ marginRight: 6 }}>{i + 1}.</span>
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
              const isAnswer = showAnswers && k === it.answerIndex;
              return (
                <div
                  key={k}
                  style={{
                    fontWeight: isAnswer ? 700 : 400,
                    color: isAnswer ? "var(--primary)" : undefined,
                  }}
                >
                  {circled(k)} <MarkedText text={c} />
                </div>
              );
            })}
          </div>
          {showAnswers && (
            <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>
              정답 {circled(it.answerIndex)}
              {it.explanation.trim() ? ` · 해설: ${it.explanation}` : ""}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
