"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { toLoginEmail } from "@/lib/login-id";
import { signUpTeacher } from "@/app/actions/auth";

export default function LoginPage() {
  const router = useRouter();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    try {
      if (mode === "signup") {
        // 교사 가입: 서버에서 즉시 생성(이메일 확인 불필요) 후 로그인
        await signUpTeacher(loginId, password, name);
      }
      const { error } = await supabase.auth.signInWithPassword({
        email: toLoginEmail(loginId),
        password,
      });
      if (error) throw error;
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container" style={{ maxWidth: 420 }}>
      <h1 style={{ color: "var(--primary)" }}>핀마스터 PinMaster</h1>
      <p className="muted">중국어 어휘 수행평가 — 연습·응시·자동채점</p>

      <div className="card">
        <form onSubmit={handleSubmit}>
          {mode === "signup" && (
            <div className="field">
              <label>이름</label>
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
          )}
          <div className="field">
            <label>아이디 (이메일이 아니어도 됨)</label>
            <input
              type="text"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div className="field">
            <label>비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              required
              minLength={6}
            />
          </div>
          {error && <p className="error">{error}</p>}
          <button className="btn" type="submit" disabled={loading} style={{ width: "100%" }}>
            {loading ? "처리 중…" : mode === "signin" ? "로그인" : "회원가입"}
          </button>
        </form>

        <p className="muted" style={{ marginTop: 12, textAlign: "center" }}>
          {mode === "signin" ? "계정이 없으신가요? " : "이미 계정이 있으신가요? "}
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setError(null);
              setMode(mode === "signin" ? "signup" : "signin");
            }}
          >
            {mode === "signin" ? "회원가입" : "로그인"}
          </a>
        </p>
      </div>
      <p className="muted" style={{ fontSize: 12 }}>
        직접 가입하면 <b>교사</b> 계정이 됩니다(이메일 확인 불필요). 학생 계정은 교사가
        “반·학생 관리”에서 일괄 발급합니다.
      </p>
    </div>
  );
}
