"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createClass,
  bulkCreateStudents,
  resetStudentPassword,
  type CreatedCredential,
  type StudentRowInput,
} from "@/app/actions/roster";
import type { ClassRow } from "@/lib/database.types";

export interface StudentLite {
  id: string;
  name: string;
  class_no: string | null;
  email: string | null;
}

export function RosterManager({
  classes,
  studentsByClass,
}: {
  classes: ClassRow[];
  studentsByClass: Record<string, StudentLite[]>;
}) {
  const router = useRouter();
  const [className, setClassName] = useState("");
  const [grade, setGrade] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedClass, setSelectedClass] = useState(classes[0]?.id ?? "");

  // 새로고침으로 classes prop이 갱신되면 선택값을 유효하게 유지
  useEffect(() => {
    if (classes.length && !classes.some((c) => c.id === selectedClass)) {
      setSelectedClass(classes[0]!.id);
    }
  }, [classes, selectedClass]);
  const [roster, setRoster] = useState("");
  const [creds, setCreds] = useState<CreatedCredential[] | null>(null);
  const [resetPw, setResetPw] = useState<Record<string, string>>({});

  async function onReset(studentId: string) {
    setError(null);
    try {
      const pw = await resetStudentPassword(studentId);
      setResetPw((m) => ({ ...m, [studentId]: pw }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "재설정 실패");
    }
  }

  async function onCreateClass(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const newId = await createClass(className, grade);
      setClassName("");
      setGrade("");
      setSelectedClass(newId);
      router.refresh(); // 서버 컴포넌트(목록) 갱신
    } catch (err) {
      setError(err instanceof Error ? err.message : "반 생성 실패");
    } finally {
      setBusy(false);
    }
  }

  function parseRoster(text: string): StudentRowInput[] {
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(/[,\t]/).map((p) => p.trim());
        const row: StudentRowInput = { name: parts[0] ?? "" };
        if (parts[1]) row.classNo = parts[1];
        if (parts[2]) row.email = parts[2];
        return row;
      })
      .filter((r) => r.name);
  }

  async function onBulkCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreds(null);
    if (!selectedClass) return setError("반을 먼저 선택/생성하세요.");
    const rows = parseRoster(roster);
    if (rows.length === 0) return setError("학생 명단을 입력하세요.");
    setBusy(true);
    try {
      const result = await bulkCreateStudents(selectedClass, rows);
      setCreds(result);
      router.refresh(); // 학생 목록 갱신
    } catch (err) {
      setError(err instanceof Error ? err.message : "일괄 생성 실패");
    } finally {
      setBusy(false);
    }
  }

  function copyCreds() {
    if (!creds) return;
    const text = creds
      .filter((c) => c.status === "created")
      .map((c) => `${c.name}\t${c.email}\t${c.password}`)
      .join("\n");
    navigator.clipboard?.writeText(text);
  }

  return (
    <>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>반 만들기</h3>
        <form onSubmit={onCreateClass} className="row" style={{ alignItems: "flex-end" }}>
          <div className="field grow">
            <label>반 이름</label>
            <input value={className} onChange={(e) => setClassName(e.target.value)} placeholder="1학년 3반" />
          </div>
          <div className="field" style={{ width: 120 }}>
            <label>학년(선택)</label>
            <input value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="1" />
          </div>
          <button className="btn" type="submit" disabled={busy || !className}>
            반 추가
          </button>
        </form>
        {classes.length > 0 && (
          <p className="muted" style={{ fontSize: 13 }}>
            기존 반: {classes.map((c) => c.name).join(", ")}
          </p>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>학생 계정 일괄 발급</h3>
        {classes.length === 0 ? (
          <p className="muted">먼저 반을 만들어 주세요.</p>
        ) : (
          <form onSubmit={onBulkCreate}>
            <div className="field">
              <label>반 선택</label>
              <select value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)}>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>명단(한 줄에 한 명: 이름,번호[,아이디])</label>
              <textarea
                rows={6}
                value={roster}
                onChange={(e) => setRoster(e.target.value)}
                placeholder={"김민준,1,minjun\n이서연,2,seoyeon\n박지호,3"}
              />
              <span className="muted" style={{ fontSize: 12 }}>
                아이디는 이메일이 아니어도 됩니다(예: minjun). 비우면 자동 생성됩니다. 임시 비밀번호가 발급되며, 학생에게 배부 후 변경을 안내하세요.
              </span>
            </div>
            {error && <p className="error">{error}</p>}
            <button className="btn" type="submit" disabled={busy}>
              {busy ? "생성 중…" : "계정 일괄 생성"}
            </button>
          </form>
        )}

        {creds && (
          <div style={{ marginTop: 16 }}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <b>발급 결과 ({creds.filter((c) => c.status === "created").length}명 생성)</b>
              <button className="btn secondary" type="button" onClick={copyCreds}>
                계정 복사(탭 구분)
              </button>
            </div>
            <p className="error" style={{ fontSize: 12 }}>
              ⚠ 임시 비밀번호는 지금만 표시됩니다. 반드시 저장·배부하세요.
            </p>
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>이름</th>
                    <th>번호</th>
                    <th>로그인 아이디</th>
                    <th>임시 비밀번호</th>
                    <th>상태</th>
                  </tr>
                </thead>
                <tbody>
                  {creds.map((c, i) => (
                    <tr key={i}>
                      <td>{c.name}</td>
                      <td>{c.classNo}</td>
                      <td>{c.email}</td>
                      <td>
                        <code>{c.password || "—"}</code>
                      </td>
                      <td>
                        {c.status === "created" ? (
                          <span className="ok">생성</span>
                        ) : (
                          <span className="error">{c.message ?? "오류"}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {selectedClass && (studentsByClass[selectedClass]?.length ?? 0) > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>등록된 학생 (비밀번호 재설정)</h3>
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>번호</th>
                  <th>이름</th>
                  <th>로그인 이메일</th>
                  <th>임시 비밀번호</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {studentsByClass[selectedClass]!.map((s) => (
                  <tr key={s.id}>
                    <td>{s.class_no ?? ""}</td>
                    <td>{s.name}</td>
                    <td>{s.email}</td>
                    <td>{resetPw[s.id] ? <code>{resetPw[s.id]}</code> : "—"}</td>
                    <td>
                      <button type="button" className="btn secondary" onClick={() => onReset(s.id)}>
                        비밀번호 재설정
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ fontSize: 12 }}>
            재설정한 임시 비밀번호는 지금만 표시됩니다. 학생에게 전달 후 변경을 안내하세요.
          </p>
        </div>
      )}
    </>
  );
}
