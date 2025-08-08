import "server-only";
import crypto from "node:crypto";

export function newState(): string {
  return crypto.randomBytes(16).toString("hex");
}

export function newCodeVerifier(): string {
  // 43-128 chars allowed. Use 64 chars URL-safe base64 without padding.
  return crypto
    .randomBytes(48)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export async function codeChallengeS256(verifier: string): Promise<string> {
  const hash = crypto.createHash("sha256").update(verifier).digest("base64");
  return hash.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export const GOOGLE_AUTH_BASE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
];


