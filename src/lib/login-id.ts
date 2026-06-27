/**
 * 로그인 아이디 → 내부 이메일 매핑 (클라이언트/서버 공용, 결정론적).
 *
 * Supabase Auth는 이메일이 필요하므로, 사용자가 @ 없는 아이디로 가입/로그인하면
 * 안정적인 합성 이메일로 변환한다. @ 포함 입력은 실제 이메일로 그대로 사용.
 * 같은 입력은 항상 같은 이메일로 매핑되어야 로그인이 재현된다.
 */

const FALLBACK_DOMAIN = "teachers.pinmaster.local";

// 작은 결정론적 해시(FNV-1a) — 비ASCII 아이디도 고유·재현 가능하게
function shortHash(s: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export function toLoginEmail(input: string): string {
  const v = input.trim().toLowerCase();
  if (v.includes("@")) return v; // 실제 이메일
  const ascii = v.replace(/[^a-z0-9._-]/g, "");
  // 한글 등으로 글자가 손실되면 해시를 붙여 충돌/유실 방지
  const local = ascii === v ? ascii : `${ascii || "u"}-${shortHash(v)}`;
  return `${local || "u"}@${FALLBACK_DOMAIN}`;
}
