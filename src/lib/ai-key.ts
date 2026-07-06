import "server-only";

/**
 * Anthropic API 키는 오직 서버 환경변수(.env.local의 ANTHROPIC_API_KEY)에서만 읽는다.
 * 웹에서 키를 입력받아 DB에 저장하는 방식(BYOK)은 보안상 폐지했다.
 */
export function getAnthropicKey(): string | undefined {
  return process.env.ANTHROPIC_API_KEY || undefined;
}

export function requireAnthropicKey(): string {
  const key = getAnthropicKey();
  if (!key) {
    throw new Error("Anthropic API 키가 설정되지 않았습니다. 서버 환경변수 ANTHROPIC_API_KEY(.env.local)를 설정하세요.");
  }
  return key;
}
