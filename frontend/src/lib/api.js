const EMAIL_API_BASE_URL =
  import.meta.env.VITE_ROLLOUT_EMAIL_API_BASE_URL ||
  "https://email.universal.rollout.com/api";

export function rolloutEmailApiBaseUrl() {
  return EMAIL_API_BASE_URL.replace(/\/$/, "");
}

export function extractMessageList(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  const candidateKeys = ["emailmessages", "messages", "data", "items", "records", "threads"];
  for (const key of candidateKeys) {
    const value = payload[key];
    if (Array.isArray(value)) return value;
  }
  const firstArray = Object.values(payload).find((value) => Array.isArray(value));
  return Array.isArray(firstArray) ? firstArray : [];
}

export function extractNextToken(payload) {
  if (!payload || typeof payload !== "object") return "";
  const next = payload?._metadata?.next;
  return typeof next === "string" && next.trim().length > 0 ? next : "";
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

export async function requestRolloutToken() {
  const response = await fetch(`${API_BASE_URL}/api/rollout/token`);
  if (!response.ok) throw new Error(`Token request failed with status ${response.status}`);
  const payload = await response.json();
  if (!payload.token) throw new Error("Token response missing `token` field");
  return payload.token;
}

