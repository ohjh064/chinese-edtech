import { describe, it, expect, beforeAll } from "vitest";
import { encryptSecret, decryptSecret, lastFour } from "./crypto.js";

beforeAll(() => {
  process.env.APP_SECRET_KEY = "test-secret-key-at-least-16-chars-long";
});

describe("crypto (AES-256-GCM, BYOK 키 보호)", () => {
  it("암호화 → 복호화 라운드트립", () => {
    const plain = "sk-ant-xxxxxxxxxxxxxxxxxxxx1234";
    const enc = encryptSecret(plain);
    expect(enc).not.toContain(plain); // 평문이 그대로 남지 않음
    expect(decryptSecret(enc)).toBe(plain);
  });

  it("같은 평문도 매번 다른 암호문(랜덤 IV)", () => {
    expect(encryptSecret("abc")).not.toBe(encryptSecret("abc"));
  });

  it("변조된 암호문은 복호화 실패(인증 태그)", () => {
    const enc = encryptSecret("hello");
    const raw = Buffer.from(enc, "base64");
    const last = raw.length - 1;
    raw[last] = (raw[last] ?? 0) ^ 0xff; // 마지막 바이트 변조
    expect(() => decryptSecret(raw.toString("base64"))).toThrow();
  });

  it("lastFour는 마지막 4자만 반환", () => {
    expect(lastFour("sk-ant-abcd1234")).toBe("1234");
  });
});
