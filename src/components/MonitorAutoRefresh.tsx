"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * 모니터링 자동 갱신 섬(island).
 * 서버 컴포넌트를 주기적으로 router.refresh()로 다시 불러와 최신 현황을 반영한다.
 */
export function MonitorAutoRefresh({ intervalSec = 10 }: { intervalSec?: number }) {
  const router = useRouter();
  const [on, setOn] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);

  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => {
      router.refresh();
      setLastRefreshed(new Date().toLocaleTimeString("ko-KR"));
    }, intervalSec * 1000);
    return () => clearInterval(t);
  }, [on, intervalSec, router]);

  return (
    <div
      className="row"
      style={{ alignItems: "center", gap: 10, fontSize: 13 }}
    >
      <button
        type="button"
        className={on ? "btn" : "btn secondary"}
        onClick={() => setOn((v) => !v)}
      >
        {on ? `⏱ 자동 갱신 켜짐 (${intervalSec}초)` : "자동 갱신 꺼짐"}
      </button>
      <button
        type="button"
        className="btn secondary"
        onClick={() => {
          router.refresh();
          setLastRefreshed(new Date().toLocaleTimeString("ko-KR"));
        }}
      >
        지금 갱신
      </button>
      {lastRefreshed && (
        <span className="muted">마지막 갱신 {lastRefreshed}</span>
      )}
    </div>
  );
}
