"use server";

import { redirect } from "next/navigation";
import {
  createSupabaseServerClient,
  createSupabaseAdminClient,
} from "@/lib/supabase/server";
import { toLoginEmail } from "@/lib/login-id";

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/**
 * 교사 자가 가입 — 관리자 API로 즉시 생성(이메일 확인 불필요).
 * 아이디(@ 없어도 됨)는 toLoginEmail로 합성 이메일에 매핑된다.
 * 반환된 이메일로 클라이언트가 곧바로 로그인한다.
 */
export async function signUpTeacher(
  idOrEmail: string,
  password: string,
  name: string,
): Promise<string> {
  const email = toLoginEmail(idOrEmail);
  if (password.length < 6) throw new Error("비밀번호는 6자 이상이어야 합니다.");

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // 확인 메일 없이 즉시 활성
    user_metadata: { name: name.trim(), role: "teacher" },
  });
  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("already") || msg.includes("registered")) {
      throw new Error("이미 등록된 아이디입니다.");
    }
    throw new Error(error.message);
  }
  // 트리거가 역할을 안 넣는 구버전이어도 교사로 보정
  if (data?.user) {
    await admin.from("profiles").upsert(
      { id: data.user.id, role: "teacher", name: name.trim(), email },
      { onConflict: "id" },
    );
  }
  return email;
}

/** 비밀번호 변경 완료 후 강제변경 플래그 해제 */
export async function completePasswordChange() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("profiles")
    .update({ must_change_password: false })
    .eq("id", user.id);
}
