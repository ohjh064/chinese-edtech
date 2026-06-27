"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { completePasswordChange } from "@/app/actions/auth";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMsg(null);
    if (pw.length < 6) return setError("비밀번호는 6자 이상이어야 합니다.");
    if (pw !== pw2) return setError("두 비밀번호가 일치하지 않습니다.");
    setBusy(true);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) {
      setBusy(false);
      return setError(error.message);
    }
    await completePasswordChange();
    setBusy(false);
    setMsg("비밀번호가 변경되었습니다.");
    setPw("");
    setPw2("");
    setTimeout(() => {
      router.push("/");
      router.refresh();
    }, 800);
  }

  return (
    <div className="container" style={{ maxWidth: 420 }}>
      <a href="#" onClick={(e) => { e.preventDefault(); router.back(); }} className="muted">
        ← 뒤로
      </a>
      <h1>비밀번호 변경</h1>
      <div className="card">
        <form onSubmit={submit}>
          <div className="field">
            <label>새 비밀번호(6자 이상)</label>
            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
          </div>
          <div className="field">
            <label>새 비밀번호 확인</label>
            <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
          </div>
          {error && <p className="error">{error}</p>}
          {msg && <p className="ok">{msg}</p>}
          <button className="btn" type="submit" disabled={busy}>
            {busy ? "변경 중…" : "변경하기"}
          </button>
        </form>
        <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
          임시 비밀번호로 처음 로그인했다면 본인만 아는 비밀번호로 꼭 변경하세요.
        </p>
      </div>
    </div>
  );
}
