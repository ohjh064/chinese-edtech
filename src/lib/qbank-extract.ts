/**
 * 기출 시험지(PDF/이미지) → 객관식 문항 추출 (Claude 멀티모달, 구조화 출력).
 * 대용량 파일은 서버 액션(React Flight) 인자 한도에 걸리므로, Route Handler에서 이 함수를 호출한다.
 */
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z from "zod/v4";

const MODEL = "claude-sonnet-4-6";

export interface ExtractedExample {
  number: string;
  type: string;
  passage: string;
  stem: string;
  choices: string[];
  answerIndex: number | null;
  explanation: string;
}

const ExtractSchema = z.object({
  items: z.array(
    z.object({
      number: z.string(),
      type: z.string(),
      passage: z.string(),
      stem: z.string(),
      choices: z.array(z.string()),
      answerIndex: z.number().int(),
      explanation: z.string(),
    }),
  ),
});

const EXTRACT_SYSTEM = [
  "당신은 한국 교사의 기출 시험지에서 객관식 문항을 구조화해 추출하는 보조자입니다.",
  "파일(PDF/이미지)에 있는 각 문항을 다음 필드로 분리하세요:",
  "- number: 시험지에 인쇄된 그 문항의 번호(예: '2', '15'). 번호가 없으면 빈 문자열.",
  "- type: 발문·지문·선지를 근거로 문항 유형을 판단하되, **아래 사용자 메시지에 제시된 허용 유형 목록 중 하나로만** 정확히",
  "  표기하세요(목록에 없는 새 유형을 만들지 마세요). 어느 유형에도 해당하지 않으면 빈 문자열로 두세요.",
  "- passage: 지문/제시문이 있으면 원문 그대로. 없으면 빈 문자열. 원문에 밑줄 친 부분이 있으면 그 부분을 `<u>...</u>`로 감싸 표시.",
  "  원문에 <보기> 상자가 있으면 그 항목(a·b·c·d 등)까지 기호와 함께 passage에 그대로 포함하세요.",
  "  그림·사진·지도·표 등 이미지가 있으면 그 핵심 내용을 텍스트로 요약해 `[그림: …]`·`[표] …`처럼 passage에 포함하세요.",
  "  이미지가 있다고 문항을 건너뛰지 말고, 텍스트로 풀 수 있게 최대한 담으세요.",
  "- stem: 발문(질문 문장). 발문 안 밑줄도 `<u>...</u>`로.",
  "- choices: 선지 배열(①②③④ 순서대로, 번호/기호는 제외한 본문만).",
  "- answerIndex: 정답 선지의 0기반 인덱스. 정답표가 없으면 -1.",
  "- explanation: 해설이 있으면 원문, 없으면 빈 문자열.",
  "원문을 임의로 지어내지 말고, 보이는 내용만 추출하세요. 불확실하면 비워 두세요.",
].join("\n");

const IMAGE_MEDIA = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

/**
 * base64 파일 → 추출 문항 배열. apiKey는 호출자가 BYOK로 해석해 전달.
 * typeNames: '유형 관리'에 등록된 유형명. AI는 이 목록 중에서만 type을 분류(새 유형 생성 금지).
 */
export async function extractExamplesFromBase64(
  apiKey: string,
  base64: string,
  mediaType: string,
  typeNames: string[] = [],
): Promise<ExtractedExample[]> {
  const isPdf = mediaType === "application/pdf";
  const isImage = IMAGE_MEDIA.has(mediaType);
  if (!isPdf && !isImage) throw new Error("PDF 또는 이미지(png/jpg/gif/webp) 파일만 지원합니다.");

  const allowed = [...new Set(typeNames.map((n) => n.trim()).filter(Boolean))];
  const typeInstruction = allowed.length
    ? `각 문항의 type은 반드시 다음 허용 유형 중 하나로만 정확히(공백·표기 그대로) 표기하세요: ${allowed
        .map((n) => `"${n}"`)
        .join(", ")}. 어느 것에도 해당하지 않으면 빈 문자열로 두세요. 목록에 없는 새 유형명을 만들지 마세요.`
    : "등록된 유형이 없으므로 모든 문항의 type은 빈 문자열로 두세요.";

  const fileBlock = isPdf
    ? {
        type: "document" as const,
        source: { type: "base64" as const, media_type: "application/pdf" as const, data: base64 },
      }
    : {
        type: "image" as const,
        source: {
          type: "base64" as const,
          media_type: mediaType as "image/png" | "image/jpeg" | "image/gif" | "image/webp",
          data: base64,
        },
      };

  const client = new Anthropic({ apiKey });
  const res = await client.messages.parse({
    model: MODEL,
    max_tokens: 8192,
    thinking: { type: "disabled" },
    output_config: { format: zodOutputFormat(ExtractSchema), effort: "medium" },
    system: EXTRACT_SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          fileBlock,
          { type: "text", text: `이 시험지의 모든 객관식 문항을 추출하세요.\n${typeInstruction}` },
        ],
      },
    ],
  });
  if (!res.parsed_output) throw new Error("추출 응답 파싱 실패");

  return res.parsed_output.items
    .filter((it) => it.stem.trim() || it.choices.some((c) => c.trim()))
    .map((it) => ({
      number: it.number.trim(),
      type: it.type.trim(),
      passage: it.passage.trim(),
      stem: it.stem.trim(),
      choices: it.choices.map((c) => c.trim()).filter(Boolean),
      answerIndex: it.answerIndex >= 0 ? it.answerIndex : null,
      explanation: it.explanation.trim(),
    }));
}
