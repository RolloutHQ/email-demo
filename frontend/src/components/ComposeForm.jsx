import { useCallback, useEffect, useState } from "react";
import { rolloutEmailApiBaseUrl, requestRolloutToken } from "../lib/api";
import { extractEmailAddress } from "../lib/emailUtils";

export default function ComposeForm({
  activeCredentialId,
  activeCredentialLabel,
  activeCredentialEmail,
  onSent
}) {
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [threadId, setThreadId] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    function handleReplyEvent(e) {
      const detail = e.detail || {};
      if (detail.to) setTo(detail.to);
      if (detail.subject) setSubject(detail.subject);
      if (detail.threadId) setThreadId(detail.threadId);
      // focus the body for quick typing
      const el = document.getElementById("compose-body");
      if (el) el.focus();
    }
    window.addEventListener("compose:reply", handleReplyEvent);
    return () => window.removeEventListener("compose:reply", handleReplyEvent);
  }, []);

  const parseRecipients = useCallback((input) => {
    if (typeof input !== "string") return [];
    const parts = input
      .split(/[;,\n]/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    const list = [];
    for (const part of parts) {
      const email = extractEmailAddress(part);
      if (!email) continue;
      let name = "";
      if (part.includes("<") && part.includes(">")) {
        name = part.split("<")[0].trim();
      }
      if (!name) name = email;
      list.push({ name, email });
    }
    return list;
  }, []);

  const handleSend = useCallback(async () => {
    setError("");
    setSuccess("");
    if (!activeCredentialId) {
      setError("Connect an email account first.");
      return;
    }
    const toList = parseRecipients(to);
    const ccList = parseRecipients(cc);
    const bccList = parseRecipients(bcc);
    const allRecipients = [...toList, ...ccList, ...bccList].filter((r, i, arr) => {
      const email = extractEmailAddress(r?.email || r);
      return email && i === arr.findIndex((x) => extractEmailAddress(x?.email || x) === email);
    });
    const senderEmail = extractEmailAddress(activeCredentialEmail) || extractEmailAddress(activeCredentialLabel);
    const senderName = activeCredentialLabel || senderEmail || "";
    if (!senderEmail) {
      setError("Unable to determine sender email for this credential.");
      return;
    }
    if (allRecipients.length === 0) {
      setError("Please provide at least one valid recipient.");
      return;
    }
    if (!subject.trim()) {
      setError("Subject is required.");
      return;
    }
    if (!body.trim()) {
      setError("Body is required.");
      return;
    }

    setIsSending(true);
    try {
      const authToken = await requestRolloutToken();
      const url = new URL(`${rolloutEmailApiBaseUrl()}/emailMessages`);
      const payload = {
        subject: subject.trim(),
        body,
        sender: { name: senderName, email: senderEmail },
        recipients: allRecipients,
        ...(threadId ? { threadId } : {})
      };
      const response = await fetch(url.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
          "x-rollout-credential-id": activeCredentialId
        },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const errPayload = await response.json().catch(() => null);
        const message =
          errPayload?.error || errPayload?.message || errPayload?.errorMessage ||
          `Failed to send email (status ${response.status}).`;
        throw new Error(message);
      }
      setSuccess("Email sent.");
      setTo("");
      setCc("");
      setBcc("");
      setSubject("");
      setBody("");
      setThreadId("");
      onSent?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsSending(false);
    }
  }, [
    activeCredentialEmail,
    activeCredentialId,
    activeCredentialLabel,
    bcc,
    body,
    cc,
    onSent,
    parseRecipients,
    subject,
    to,
    threadId
  ]);

  return (
    <section className="compose">
      <header className="inbox__header">
        <div className="inbox__title">
          <h2>Compose Email</h2>
          {activeCredentialLabel && (
            <span className="inbox__account">From: {activeCredentialLabel}</span>
          )}
        </div>
        {activeCredentialId && (
          <div className="inbox__actions">
            <button type="button" onClick={handleSend} disabled={isSending}>
              {isSending ? "Sending…" : "Send"}
            </button>
          </div>
        )}
      </header>
      {!activeCredentialId && (
        <p className="inbox__empty">Connect an email credential to compose.</p>
      )}
      {activeCredentialId && (
        <div className="compose__form">
          {error && <p className="error">{error}</p>}
          {success && <p className="success">{success}</p>}
          <div className="field">
            <label htmlFor="compose-to">To</label>
            <input
              id="compose-to"
              type="text"
              placeholder="name@example.com, Other <other@example.com>"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="compose-cc">CC</label>
            <input id="compose-cc" type="text" placeholder="optional" value={cc} onChange={(e) => setCc(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="compose-bcc">BCC</label>
            <input id="compose-bcc" type="text" placeholder="optional" value={bcc} onChange={(e) => setBcc(e.target.value)} />
            <p className="hint">Note: API does not separate CC/BCC; all recipients are sent together.</p>
          </div>
          <div className="field">
            <label htmlFor="compose-subject">Subject</label>
            <input id="compose-subject" type="text" placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="compose-body">Body</label>
            <textarea id="compose-body" rows={8} placeholder="Write your message…" value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
        </div>
      )}
    </section>
  );
}
