"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setAnthropicKey, removeAnthropicKey } from "@/app/actions/teacher";

export function ApiKeyForm({ last4 }: { last4: string | null }) {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMsg(null);
    setBusy(true);
    try {
      await setAnthropicKey(key);
      setKey("");
      setMsg("API 키가 안전하게 저장되었습니다.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장 실패");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setError(null);
    setMsg(null);
    setBusy(true);
    try {
      await removeAnthropicKey();
      setMsg("API 키를 삭제했습니다.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "삭제 실패");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>내 Anthropic API 키 (AI 채점)</h3>
      {last4 ? (
        <p className="ok">현재 키 설정됨: sk-ant-…{last4}</p>
      ) : (
        <p className="muted">아직 키가 없습니다. 키가 없으면 의미·문장은 AI 없이 교사 검토로 넘어갑니다.</p>
      )}
      <form onSubmit={save}>
        <div className="field">
          <label>API 키 입력(sk-ant-…)</label>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="sk-ant-..."
            autoComplete="off"
          />
        </div>
        {error && <p className="error">{error}</p>}
        {msg && <p className="ok">{msg}</p>}
        <div className="row">
          <button className="btn" type="submit" disabled={busy || !key}>
            {busy ? "처리 중…" : last4 ? "키 교체" : "키 저장"}
          </button>
          {last4 && (
            <button className="btn secondary" type="button" onClick={remove} disabled={busy}>
              키 삭제
            </button>
          )}
        </div>
      </form>
      <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
        키는 서버에서 암호화(AES-256-GCM)되어 저장되며, 학생이나 다른 교사에게 노출되지 않습니다.
        이 키로 <b>본인과 본인 학생들의</b> 의미·문장 AI 채점 비용이 청구됩니다.
        키는{" "}
        <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">
          Anthropic 콘솔
        </a>
        에서 발급할 수 있습니다.
      </p>
    </div>
  );
}
