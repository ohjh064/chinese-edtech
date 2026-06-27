/**
 * AI 채점 결과 캐싱 래퍼 (PRD §11 비용 효율).
 *
 * 같은 입력(한자·학생답안·허용정답/예문)의 판정을 ai_cache에서 재사용해
 * AI 호출 수를 줄인다. BYOK 구조에서 교사 비용을 직접 절감한다.
 * 캐시 미스만 base 공급자로 묶어서(batch) 호출하고, 결과를 저장한다.
 */
import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AiGradingProvider,
  GrammarCheckItem,
  GrammarResult,
  MeaningJudgeItem,
  MeaningVerdict,
} from "@/grading/index.js";

function sha(obj: unknown): string {
  return createHash("sha256").update(JSON.stringify(obj)).digest("hex");
}

function meaningKey(it: MeaningJudgeItem): string {
  return sha({
    k: "meaning",
    h: it.hanzi,
    m: it.studentMeaning.trim().toLowerCase(),
    a: [...it.acceptableMeanings].map((s) => s.trim().toLowerCase()).sort(),
  });
}

function grammarKey(it: GrammarCheckItem): string {
  return sha({
    k: "grammar",
    h: it.hanzi,
    s: it.studentSentence.trim(),
    e: it.exampleSentence?.trim() ?? "",
  });
}

interface CacheRow {
  key: string;
  result: unknown;
}

async function readCache(
  admin: SupabaseClient,
  keys: string[],
): Promise<Map<string, unknown>> {
  const map = new Map<string, unknown>();
  if (keys.length === 0) return map;
  const { data } = await admin
    .from("ai_cache")
    .select("key, result")
    .in("key", [...new Set(keys)]);
  for (const row of (data ?? []) as CacheRow[]) map.set(row.key, row.result);
  return map;
}

async function writeCache(
  admin: SupabaseClient,
  kind: string,
  entries: { key: string; result: unknown }[],
): Promise<void> {
  if (entries.length === 0) return;
  const rows = entries.map((e) => ({ key: e.key, kind, result: e.result }));
  try {
    await admin.from("ai_cache").upsert(rows, { onConflict: "key" });
  } catch {
    /* 캐시 쓰기 실패는 채점에 영향 없음 */
  }
}

export function createCachingProvider(
  base: AiGradingProvider,
  admin: SupabaseClient,
): AiGradingProvider {
  return {
    async judgeMeanings(items: MeaningJudgeItem[]): Promise<MeaningVerdict[]> {
      if (items.length === 0) return [];
      const keys = items.map(meaningKey);
      const cached = await readCache(admin, keys);

      // 미스를 key 기준으로 중복 제거(같은 답안 한 번만 AI 호출)
      const missByKey = new Map<string, MeaningJudgeItem>();
      items.forEach((it, i) => {
        const k = keys[i]!;
        if (!cached.has(k) && !missByKey.has(k)) missByKey.set(k, it);
      });

      if (missByKey.size > 0) {
        const verdicts = await base.judgeMeanings([...missByKey.values()]);
        const byWordId = new Map(verdicts.map((v) => [v.wordId, v]));
        const toWrite: { key: string; result: unknown }[] = [];
        for (const [k, rep] of missByKey) {
          const v = byWordId.get(rep.wordId);
          const result = {
            verdict: v?.verdict ?? "reject",
            reason: v?.reason,
          };
          cached.set(k, result);
          toWrite.push({ key: k, result });
        }
        await writeCache(admin, "meaning", toWrite);
      }

      return items.map((it, i) => {
        const r = (cached.get(keys[i]!) ?? { verdict: "reject" }) as {
          verdict: MeaningVerdict["verdict"];
          reason?: string;
        };
        const out: MeaningVerdict = { wordId: it.wordId, verdict: r.verdict };
        if (r.reason) out.reason = r.reason;
        return out;
      });
    },

    async checkGrammar(items: GrammarCheckItem[]): Promise<GrammarResult[]> {
      if (items.length === 0) return [];
      const keys = items.map(grammarKey);
      const cached = await readCache(admin, keys);

      const missByKey = new Map<string, GrammarCheckItem>();
      items.forEach((it, i) => {
        const k = keys[i]!;
        if (!cached.has(k) && !missByKey.has(k)) missByKey.set(k, it);
      });

      if (missByKey.size > 0) {
        const results = await base.checkGrammar([...missByKey.values()]);
        const byWordId = new Map(results.map((r) => [r.wordId, r]));
        const toWrite: { key: string; result: unknown }[] = [];
        for (const [k, rep] of missByKey) {
          const r = byWordId.get(rep.wordId);
          const result = {
            errorCount: r?.errorCount ?? 0,
            issues: r?.issues ?? [],
          };
          cached.set(k, result);
          toWrite.push({ key: k, result });
        }
        await writeCache(admin, "grammar", toWrite);
      }

      return items.map((it, i) => {
        const r = (cached.get(keys[i]!) ?? { errorCount: 0, issues: [] }) as {
          errorCount: number;
          issues: { message: string; span?: string }[];
        };
        return { wordId: it.wordId, errorCount: r.errorCount, issues: r.issues };
      });
    },
  };
}
