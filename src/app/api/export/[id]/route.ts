/**
 * NEIS 입력용 엑셀 내보내기 (PRD §2.2, §13).
 * 교사 권한으로 해당 평가의 제출·점수·학생을 모아 .xlsx로 반환.
 */
import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  Assessment,
  Grade,
  Profile,
  Submission,
} from "@/lib/database.types";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: assessment } = await supabase
    .from("assessments")
    .select("*")
    .eq("id", id)
    .single<Assessment>();
  if (!assessment || assessment.teacher_id !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data: subs } = await supabase
    .from("submissions")
    .select("*")
    .eq("assessment_id", id);
  const submissions = (subs ?? []) as Submission[];

  const studentIds = [...new Set(submissions.map((s) => s.student_id))];
  const { data: profileRows } = studentIds.length
    ? await supabase
        .from("profiles")
        .select("id,name,class_no")
        .in("id", studentIds)
    : { data: [] as Pick<Profile, "id" | "name" | "class_no">[] };
  const profById = new Map((profileRows ?? []).map((p) => [p.id, p]));

  const subIds = submissions.map((s) => s.id);
  const { data: gradeRows } = subIds.length
    ? await supabase.from("grades").select("*").in("submission_id", subIds)
    : { data: [] as Grade[] };
  const gradeBySub = new Map(
    ((gradeRows ?? []) as Grade[]).map((g) => [g.submission_id, g]),
  );

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("수행평가");
  sheet.columns = [
    { header: "번호", key: "class_no", width: 8 },
    { header: "이름", key: "name", width: 14 },
    { header: "병음(25)", key: "pinyin", width: 10 },
    { header: "성조(25)", key: "tone", width: 10 },
    { header: "의미(25)", key: "meaning", width: 10 },
    { header: "문장(25)", key: "sentence", width: 10 },
    { header: "합계(100)", key: "total", width: 10 },
    { header: "최종", key: "final", width: 8 },
    { header: "확정", key: "finalized", width: 8 },
  ];
  sheet.getRow(1).font = { bold: true };

  const sorted = [...submissions].sort((a, b) => {
    const an = profById.get(a.student_id)?.class_no ?? "";
    const bn = profById.get(b.student_id)?.class_no ?? "";
    return an.localeCompare(bn, "ko", { numeric: true });
  });

  for (const s of sorted) {
    const p = profById.get(s.student_id);
    const g = gradeBySub.get(s.id);
    sheet.addRow({
      class_no: p?.class_no ?? "",
      name: p?.name ?? "",
      pinyin: g?.pinyin_score ?? "",
      tone: g?.tone_score ?? "",
      meaning: g?.meaning_score ?? "",
      sentence: g?.sentence_score ?? "",
      total: g?.total ?? "",
      final: g?.final ?? "",
      finalized: g?.teacher_finalized ? "O" : "",
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = encodeURIComponent(`${assessment.title}_점수.xlsx`);
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
    },
  });
}
