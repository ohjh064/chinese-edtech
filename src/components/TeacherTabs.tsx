import Link from "next/link";

/**
 * 교사 콘텐츠 관리 탭바(평가 관리 / 단어 세트 / 회화 세트).
 * 각 탭은 해당 관리 페이지로 이동(탭 내비게이션). 반·학생 관리·설정은 우측 유틸 링크.
 * 서버 컴포넌트 — active prop으로 현재 탭을 하이라이트(클라 JS 불필요).
 */
export type TeacherTab = "assessments" | "wordsets" | "studio" | "question-bank";

const TABS: { key: TeacherTab; label: string; href: string }[] = [
  { key: "assessments", label: "평가 관리", href: "/teacher" },
  { key: "wordsets", label: "단어 세트", href: "/teacher/wordsets" },
  { key: "studio", label: "회화 세트", href: "/teacher/studio" },
  { key: "question-bank", label: "문제 은행", href: "/teacher/question-bank" },
];

export function TeacherTabs({ active }: { active: TeacherTab }) {
  return (
    <div
      className="row"
      style={{
        gap: 6,
        alignItems: "center",
        borderBottom: "1px solid var(--border)",
        paddingBottom: 10,
        marginBottom: 16,
      }}
    >
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={`btn ${active === t.key ? "" : "secondary"}`}
        >
          {t.label}
        </Link>
      ))}
      <span style={{ marginLeft: "auto" }} />
      <Link className="btn secondary" href="/teacher/classes" style={{ fontSize: 13, padding: "6px 12px" }}>
        반·학생 관리
      </Link>
      <Link className="btn secondary" href="/teacher/settings" style={{ fontSize: 13, padding: "6px 12px" }}>
        설정
      </Link>
    </div>
  );
}
