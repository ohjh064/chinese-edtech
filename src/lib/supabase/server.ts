/**
 * 서버 컴포넌트/액션/라우트용 Supabase 클라이언트 (@supabase/ssr).
 * 쿠키 기반 세션을 사용하며 RLS가 사용자 권한을 강제한다.
 */
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // 서버 컴포넌트에서 set 호출 시 무시(미들웨어가 갱신 담당)
          }
        },
      },
    },
  );
}

/**
 * 서비스 롤 클라이언트 — RLS 우회. 정답키를 읽어 채점하는 서버 전용 작업에만 사용.
 * 절대 클라이언트 번들에 포함되지 않도록 서버 코드에서만 import.
 */
export function createSupabaseAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
