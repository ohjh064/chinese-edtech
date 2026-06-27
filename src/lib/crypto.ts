/**
 * 교사 API 키 등 민감 정보의 대칭키 암호화 (AES-256-GCM).
 *
 * - 키는 환경변수 APP_SECRET_KEY에서 파생(sha256 → 32바이트). 형식 무관(아무 긴 문자열).
 * - 저장 포맷: base64( iv(12) | authTag(16) | ciphertext ).
 * - 서버 전용. 복호화는 채점 시점 서버에서만 수행하며, 평문 키는 절대 응답/로그에 노출 금지.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const IV_LEN = 12;
const TAG_LEN = 16;

function getKey(): Buffer {
  const secret = process.env.APP_SECRET_KEY;
  if (!secret || secret.length < 16) {
    throw new Error(
      "APP_SECRET_KEY 환경변수가 필요합니다(16자 이상). 키 암호화에 사용됩니다.",
    );
  }
  return createHash("sha256").update(secret).digest(); // 32 bytes
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptSecret(payload: string): string {
  const raw = Buffer.from(payload, "base64");
  const iv = raw.subarray(0, IV_LEN);
  const tag = raw.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const enc = raw.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

/** 표시용 마지막 4자(평문 키 노출 없이 "설정됨" 표시) */
export function lastFour(plain: string): string {
  return plain.slice(-4);
}
