import { NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseAdminClient } from "@/lib/supabase/server";

// 교사가 PC에서 올린 단어 이미지를 Supabase Storage('word-images', 공개)에 저장하고 공개 URL을 반환.
// 대용량 파일을 서버 액션 인자로 넘기면 React Flight 한도에 걸리므로 Route Handler(multipart)로 처리.

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

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

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "파일이 없습니다" }, { status: 400 });
    }
    const ext = EXT[file.type];
    if (!ext) {
      return NextResponse.json({ error: "이미지 파일(png/jpg/gif/webp)만 업로드할 수 있습니다" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "이미지는 5MB 이하만 업로드할 수 있습니다" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const admin = createSupabaseAdminClient();
    const { error: upErr } = await admin.storage
      .from("word-images")
      .upload(path, buffer, { contentType: file.type, upsert: false });
    if (upErr) {
      return NextResponse.json({ error: `업로드 실패: ${upErr.message}` }, { status: 500 });
    }
    const { data: pub } = admin.storage.from("word-images").getPublicUrl(path);
    return NextResponse.json({ url: pub.publicUrl });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "업로드 실패" }, { status: 500 });
  }
}
