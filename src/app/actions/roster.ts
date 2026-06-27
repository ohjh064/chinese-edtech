"use server";

/**
 * 반 관리 + 학생 계정 일괄 발급 (PRD §15-6, §3.3).
 *
 * 학생 이메일이 없는 학교 환경을 고려해, 이메일 미입력 시 결정론적으로 생성하고
 * 임시 비밀번호를 발급한다. 계정 생성은 service-role(admin)로 수행하며,
 * 호출자가 교사인지/해당 반을 소유하는지 먼저 검증한다.
 * 반환된 임시 비밀번호는 1회성 — 교사가 학생에게 배부 후 변경 안내.
 */
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import {
  createSupabaseServerClient,
  createSupabaseAdminClient,
} from "@/lib/supabase/server";
import { toLoginEmail } from "@/lib/login-id";
import type { ClassRow } from "@/lib/database.types";

async function requireTeacher() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("로그인이 필요합니다");
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<{ role: string }>();
  if (profile?.role !== "teacher") throw new Error("교사만 사용할 수 있습니다");
  return { supabase, userId: user.id };
}

export async function createClass(name: string, grade?: string): Promise<string> {
  const { supabase, userId } = await requireTeacher();
  const { data, error } = await supabase
    .from("classes")
    .insert({
      name: name.trim(),
      grade: grade?.trim() || null,
      teacher_id: userId,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "반 생성 실패");
  revalidatePath("/teacher/classes");
  return data.id as string;
}

export interface StudentRowInput {
  name: string;
  classNo?: string;
  email?: string;
}

export interface CreatedCredential {
  name: string;
  classNo: string;
  email: string;
  password: string;
  status: "created" | "enrolled_existing" | "error";
  message?: string;
}

const PW_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // 혼동 문자 제외
function tempPassword(len = 8): string {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += PW_ALPHABET[bytes[i]! % PW_ALPHABET.length];
  return out;
}

function sanitize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 24);
}

export async function bulkCreateStudents(
  classId: string,
  rows: StudentRowInput[],
): Promise<CreatedCredential[]> {
  const { supabase, userId } = await requireTeacher();

  // 반 소유 확인(RLS도 강제)
  const { data: cls } = await supabase
    .from("classes")
    .select("*")
    .eq("id", classId)
    .single<ClassRow>();
  if (!cls || cls.teacher_id !== userId) throw new Error("권한이 없는 반입니다");

  const admin = createSupabaseAdminClient();
  const results: CreatedCredential[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const name = row.name.trim();
    if (!name) continue;
    const classNo = (row.classNo ?? "").trim();
    // 3번째 칸 = 로그인 아이디(또는 이메일). 비우면 자동 생성. @ 없으면 내부 이메일로 매핑.
    const loginId =
      row.email?.trim() ||
      `c${classId.slice(0, 8)}-${sanitize(classNo || String(i + 1))}`;
    const email = toLoginEmail(loginId); // Supabase Auth용 실제 이메일
    const password = tempPassword();

    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, role: "student" }, // 트리거가 student로 생성
    });

    if (error || !created?.user) {
      results.push({
        name,
        classNo,
        email: loginId,
        password: "",
        status: "error",
        message: error?.message ?? "계정 생성 실패",
      });
      continue;
    }

    const studentId = created.user.id;
    // 프로필 보강(트리거가 기본 생성 → 역할/번호/로그인아이디 반영)
    await admin.from("profiles").upsert(
      {
        id: studentId,
        role: "student",
        name,
        email,
        class_no: classNo || null,
        must_change_password: true,
      },
      { onConflict: "id" },
    );
    // 반 배정
    await admin
      .from("enrollments")
      .upsert({ student_id: studentId, class_id: classId }, { onConflict: "student_id,class_id" });

    results.push({ name, classNo, email: loginId, password, status: "created" });
  }

  revalidatePath("/teacher/classes");
  return results;
}

/** 교사가 담당 반 학생의 비밀번호 재설정(임시 비번 발급). 본인 반 학생만 가능. */
export async function resetStudentPassword(studentId: string): Promise<string> {
  const { supabase, userId } = await requireTeacher();

  // 학생이 내 반에 속해 있는지 확인(RLS: 내 반 enrollments만 조회됨)
  const { data: enr } = await supabase
    .from("enrollments")
    .select("class_id, classes!inner(teacher_id)")
    .eq("student_id", studentId);
  const ownsStudent = (enr ?? []).some(
    (e: { classes: { teacher_id: string } | { teacher_id: string }[] }) => {
      const c = Array.isArray(e.classes) ? e.classes[0] : e.classes;
      return c?.teacher_id === userId;
    },
  );
  if (!ownsStudent) throw new Error("담당 반 학생이 아닙니다");

  const password = tempPassword();
  const admin = createSupabaseAdminClient();
  const { error } = await admin.auth.admin.updateUserById(studentId, { password });
  if (error) throw new Error(error.message);
  // 다음 로그인 시 강제 변경
  await admin.from("profiles").update({ must_change_password: true }).eq("id", studentId);
  return password;
}
