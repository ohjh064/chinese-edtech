import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { decryptSecret } from "@/lib/crypto";
import { extractExamplesFromBase64 } from "@/lib/qbank-extract";

// 대용량 PDF/이미지는 서버 액션(React Flight) 인자 한도에 걸리므로 Route Handler로 처리한다.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single<{ role: string }>();
    if (profile?.role !== "teacher") {
      return NextResponse.json({ error: "교사만 사용할 수 있습니다" }, { status: 403 });
    }

    // BYOK 키 해석(교사 본인) → env fallback
    let apiKey: string | undefined;
    const { data: secret } = await supabase
      .from("teacher_secrets")
      .select("anthropic_key_encrypted")
      .eq("teacher_id", user.id)
      .maybeSingle<{ anthropic_key_encrypted: string }>();
    if (secret?.anthropic_key_encrypted) {
      try {
        apiKey = decryptSecret(secret.anthropic_key_encrypted);
      } catch {
        /* fallback */
      }
    }
    if (!apiKey && process.env.ANTHROPIC_API_KEY) apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Anthropic API 키가 설정되지 않았습니다. 교사 설정에서 키를 입력하세요." },
        { status: 400 },
      );
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "파일이 없습니다" }, { status: 400 });
    }

    // '유형 관리'에 등록된 유형명만 허용 → AI가 그 안에서만 분류(새 유형 생성 금지)
    const { data: typeRows } = await supabase
      .from("qbank_types")
      .select("name")
      .eq("teacher_id", user.id);
    const typeNames = ((typeRows ?? []) as { name: string }[]).map((t) => t.name);

    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const items = await extractExamplesFromBase64(apiKey, base64, file.type, typeNames);
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "추출 실패" },
      { status: 500 },
    );
  }
}
