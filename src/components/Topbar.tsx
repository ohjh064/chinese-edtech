import Link from "next/link";
import { signOut } from "@/app/actions/auth";

export function Topbar({
  name,
  role,
  home,
}: {
  name: string;
  role: string;
  home: string;
}) {
  return (
    <div className="topbar">
      <Link href={home} className="brand">
        핀마스터 PinMaster
      </Link>
      <div className="row" style={{ alignItems: "center" }}>
        <span className="muted">
          {name} · {role === "teacher" ? "교사" : "학생"}
        </span>
        <Link href="/account/password" className="muted" style={{ fontSize: 13 }}>
          비밀번호 변경
        </Link>
        <form action={signOut}>
          <button className="btn secondary" type="submit">
            로그아웃
          </button>
        </form>
      </div>
    </div>
  );
}
