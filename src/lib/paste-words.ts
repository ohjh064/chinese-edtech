/**
 * 엑셀·구글시트 붙여넣기 → 단어 행 파싱 (단어 세트 대량 입력).
 * 형식: 줄바꿈=행, 탭=열. 열 순서 = 단어(한자) · 의미 · 예문(선택).
 * 병음/성조는 파싱하지 않는다(붙여넣기 후 pinyin-pro 자동 보완).
 */
export interface PastedWord {
  hanzi: string;
  meaning: string;
  example: string;
}

const HEADER_TOKENS = new Set([
  "단어", "한자", "의미", "뜻", "예문", "word", "meaning", "example",
]);

function isHeaderRow(cols: string[]): boolean {
  // 첫 두 칸이 모두 헤더 단어면 헤더로 간주(데이터 아님)
  const a = (cols[0] ?? "").toLowerCase();
  const b = (cols[1] ?? "").toLowerCase();
  return HEADER_TOKENS.has(a) && (b === "" || HEADER_TOKENS.has(b));
}

export function parsePastedWords(text: string): PastedWord[] {
  const rows: PastedWord[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    // 탭 우선, 없으면 콤마도 허용(단순 붙여넣기 대비)
    const cols = (rawLine.includes("\t") ? rawLine.split("\t") : rawLine.split(","))
      .map((c) => c.trim());
    if (isHeaderRow(cols)) continue;
    const hanzi = cols[0] ?? "";
    if (!hanzi) continue;
    rows.push({
      hanzi,
      meaning: cols[1] ?? "",
      example: cols[2] ?? "",
    });
  }
  return rows;
}
