export const EMAIL_ADDRESS_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

export function normalizeEmail(value) {
  return typeof value === "string" && value.length > 0 ? value.trim().toLowerCase() : "";
}

export function extractEmailAddress(value) {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const email = extractEmailAddress(entry);
      if (email) return email;
    }
    return "";
  }
  if (!value) return "";
  if (typeof value === "string") {
    const match = value.match(EMAIL_ADDRESS_REGEX);
    return match ? normalizeEmail(match[0]) : "";
  }
  if (typeof value === "object") {
    const candidateKeys = [
      "email",
      "emailAddress",
      "address",
      "value",
      "primary",
      "username",
      "login",
      "accountEmail",
      "accountName"
    ];
    for (const key of candidateKeys) {
      if (key in value) {
        const email = extractEmailAddress(value[key]);
        if (email) return email;
      }
    }
    if (value.profile) {
      const email = extractEmailAddress(value.profile);
      if (email) return email;
    }
    if (value.data) {
      const email = extractEmailAddress(value.data);
      if (email) return email;
    }
  }
  return "";
}

export function deriveCredentialEmail(credential, fallbackLabel = "") {
  const candidates = [
    credential?.profile?.email,
    credential?.profile?.emails,
    credential?.profile?.accountEmail,
    credential?.profile?.accountName,
    credential?.profile,
    credential?.label,
    credential?.data?.email,
    credential?.data,
    fallbackLabel
  ];
  for (const candidate of candidates) {
    const email = extractEmailAddress(candidate);
    if (email) return email;
  }
  return "";
}

export function emailsMatch(left, right) {
  const normalizedLeft = normalizeEmail(left);
  const normalizedRight = normalizeEmail(right);
  return normalizedLeft.length > 0 && normalizedLeft === normalizedRight;
}

export function htmlToPlainText(value) {
  if (typeof value !== "string" || value.trim().length === 0) return "";
  if (typeof window !== "undefined" && "DOMParser" in window) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(value, "text/html");
      return doc.body.textContent || "";
    } catch {}
  }
  return value.replace(/<\s*br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, "");
}

export function extractBodyText(message) {
  if (!message || typeof message !== "object") return "";
  const candidates = [
    message.body,
    message.textBody,
    message.plainText,
    message.snippet,
    message.preview,
    message.summary,
    message.original?.email?.snippet,
    Array.isArray(message.fragments) ? message.fragments.join("\n\n") : null
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      const plain = htmlToPlainText(candidate);
      if (plain.trim().length > 0) return plain.trim();
    }
  }
  return "";
}

const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const dateFormatterShort = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const dateFormatterLong = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });

export function formatMessageTimestamp(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return timeFormatter.format(date);
  const sameYear = date.getFullYear() === now.getFullYear();
  if (sameYear) return dateFormatterShort.format(date);
  return dateFormatterLong.format(date);
}

export function asNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : "";
}

export function extractSenderDetails(value) {
  if (!value) return { display: "", email: "" };
  if (Array.isArray(value)) {
    for (const entry of value) {
      const details = extractSenderDetails(entry);
      if (details.display || details.email) return details;
    }
    return { display: "", email: "" };
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return { display: trimmed, email: extractEmailAddress(trimmed) };
  }
  if (typeof value === "object") {
    const email =
      extractEmailAddress(value.email) ||
      extractEmailAddress(value.emailAddress) ||
      extractEmailAddress(value.address) ||
      extractEmailAddress(value);
    const name = asNonEmptyString(value.displayName) || asNonEmptyString(value.name);
    const emailDisplay = asNonEmptyString(value.email) || asNonEmptyString(value.emailAddress) || asNonEmptyString(value.address);
    let display = "";
    if (name) display = email ? `${name} <${email}>` : name;
    else if (emailDisplay) display = emailDisplay;
    if (!display && email) display = email;
    return { display, email };
  }
  return { display: "", email: "" };
}

export function truncateBody(body) {
  if (typeof body !== "string") return "";
  const trimmed = body.trim();
  if (trimmed.length === 0) return "";
  const limit = 280;
  if (trimmed.length <= limit) return trimmed;
  return `${trimmed.slice(0, limit - 1)}…`;
}

export function resolveCredentialLabel(credential) {
  if (!credential || typeof credential !== "object") return "";
  const profileName = credential.profile?.accountName;
  if (typeof profileName === "string" && profileName.trim().length > 0) return profileName.trim();
  const label = credential.label || credential.appKey || credential.id;
  return typeof label === "string" ? label : "";
}

