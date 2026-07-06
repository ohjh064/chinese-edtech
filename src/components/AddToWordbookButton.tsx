"use client";

import { useState } from "react";
import { addToWordbook, type WordbookInput } from "@/app/actions/wordbook";

/**
 * "＋ 내 단어장" 담기 버튼(재사용). 단어학습·플래시카드·회화 핵심표현에 삽입.
 * 대상이 바뀌면 부모가 key로 리마운트해 상태를 초기화한다(예: key={card.wordId}).
 */
export function AddToWordbookButton({
  item,
  className = "btn secondary",
  size = "sm",
}: {
  item: WordbookInput;
  className?: string;
  size?: "sm" | "md";
}) {
  const [state, setState] = useState<"idle" | "saving" | "done">("idle");
  const pad = size === "md" ? "6px 12px" : "4px 10px";

  async function save() {
    if (state !== "idle") return;
    setState("saving");
    try {
      await addToWordbook(item);
      setState("done");
    } catch {
      setState("idle");
    }
  }

  return (
    <button
      type="button"
      className={className}
      onClick={save}
      disabled={state !== "idle"}
      title="내 단어장에 담기"
      style={{ padding: pad, fontSize: 13, whiteSpace: "nowrap" }}
    >
      {state === "done" ? "담김 ✓" : state === "saving" ? "담는 중…" : "＋ 내 단어장"}
    </button>
  );
}
