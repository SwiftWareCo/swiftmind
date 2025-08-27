
import "server-only";
import crypto from "node:crypto";

export type EncryptedPayload = {
  ciphertext: string; // base64url(ct || tag)
  nonce: string; // base64url(12 bytes)
  keyVersion: "v1";
};

export function hashContent(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function getKeyV1(): Buffer {
  const base64 = process.env.INTEGRATION_KEY_V1_BASE64;
  if (!base64) {
    throw new Error("Missing INTEGRATION_KEY_V1_BASE64 env (base64-encoded 32-byte key)");
  }
  let key: Buffer;
  try {
    key = Buffer.from(base64, "base64");
  } catch (e: unknown) {
    throw new Error("Invalid INTEGRATION_KEY_V1_BASE64: base64 decode failed");
  }
  if (key.length !== 32) {
    throw new Error("Invalid INTEGRATION_KEY_V1_BASE64: expected 32-byte key after base64 decode");
  }
  return key;
}

function toBase64Url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(s: string): Buffer {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? 0 : 4 - (b64.length % 4);
  return Buffer.from(b64 + "=".repeat(pad), "base64");
}

export async function encryptJson<T extends object>(obj: T): Promise<EncryptedPayload> {
  const key = getKeyV1();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(obj), "utf8");
  const enc1 = cipher.update(plaintext);
  const enc2 = cipher.final();
  const tag = cipher.getAuthTag();
  const ciphertextWithTag = Buffer.concat([enc1, enc2, tag]);
  return {
    ciphertext: toBase64Url(ciphertextWithTag),
    nonce: toBase64Url(iv),
    keyVersion: "v1",
  };
}

export async function decryptJson<T = unknown>(ciphertext: string, nonce: string): Promise<T> {
  const key = getKeyV1();
  const iv = fromBase64Url(nonce);
  if (iv.length !== 12) {
    throw new Error("Invalid nonce: expected 12-byte base64url");
  }
  const data = fromBase64Url(ciphertext);
  if (data.length < 17) {
    throw new Error("Invalid ciphertext: too short for AES-GCM tag");
  }
  const tag = data.subarray(data.length - 16);
  const ct = data.subarray(0, data.length - 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const dec1 = decipher.update(ct);
  const dec2 = decipher.final();
  const plaintext = Buffer.concat([dec1, dec2]).toString("utf8");
  return JSON.parse(plaintext) as T;
}


