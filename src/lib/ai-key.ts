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

/**
 * AI(Anthropic) 호출 에러를 학생·교사에게 그대로 보여줄 수 있는 한국어 메시지로 변환한다.
 * 원시 JSON(예: `400 {"type":"error",...}`)이 UI에 노출되지 않도록 각 액션의 AI 호출을 감쌀 때 사용.
 */
export function aiErrorMessage(e: unknown): string {
  const status = (e as { status?: number })?.status;
  const raw =
    (e as { error?: { error?: { message?: string } } })?.error?.error?.message ??
    (e as { message?: string })?.message ??
    "";
  const msg = String(raw);
  if (/organization has been disabled/i.test(msg)) {
    return "AI 기능을 지금 사용할 수 없어요. 서버 API 키의 조직이 비활성화(결제·크레딧 문제)되어 있어요. 선생님/관리자에게 문의해 주세요.";
  }
  if (status === 401 || /invalid x-api-key|authentication_error/i.test(msg)) {
    return "AI 인증에 실패했어요(API 키가 올바르지 않음). 선생님/관리자에게 문의해 주세요.";
  }
  if (/credit balance is too low|insufficient/i.test(msg)) {
    return "AI 사용 크레딧이 부족해요. 선생님/관리자에게 문의해 주세요.";
  }
  if (status === 429 || /rate limit|overloaded/i.test(msg)) {
    return "지금 AI 요청이 많아요. 잠시 후 다시 시도해 주세요.";
  }
  return "AI 응답에 실패했어요. 잠시 후 다시 시도해 주세요.";
}
