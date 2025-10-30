import "@rollout/link-react/style.css";
import { useCallback, useEffect, useState } from "react";
import { RolloutLinkProvider, CredentialsManager } from "@rollout/link-react";
import ComposeForm from "./components/ComposeForm";
import Inbox from "./components/Inbox";
import { requestRolloutToken, rolloutEmailApiBaseUrl, extractMessageList, extractNextToken } from "./lib/api";
import {
  deriveCredentialEmail,
  extractBodyText,
  extractEmailAddress,
  extractSenderDetails,
  asNonEmptyString,
  emailsMatch,
  resolveCredentialLabel,
  truncateBody
} from "./lib/emailUtils";

const TARGET_CONNECTOR_APP_KEY = "gmail";
const CREDENTIALS_API_URL =
  import.meta.env.VITE_ROLLOUT_CREDENTIALS_URL ||
  "https://universal.rollout.com/api/credentials";
const DEFAULT_MESSAGE_LIMIT = 20;

function extractCredentialList(payload) {
  if (!payload) {
    return [];
  }

  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload.credentials)) {
    return payload.credentials;
  }

  if (Array.isArray(payload.data)) {
    return payload.data;
  }

  const firstArray = Object.values(payload).find((value) => Array.isArray(value));
  return Array.isArray(firstArray) ? firstArray : [];
}

function normalizeMessage(message, index) {
  if (!message || typeof message !== "object") {
    return {
      id: `message-${index}`,
      subject: String(message ?? ""),
      from: "",
      snippet: "",
      receivedAt: ""
    };
  }

  const id =
    message.id ||
    message.messageId ||
    message.externalId ||
    message.threadId ||
    `message-${index}`;

  const subject =
    asNonEmptyString(message.subject) ||
    asNonEmptyString(message.snippet) ||
    asNonEmptyString(message.preview) ||
    "(No subject)";

  const senderSources = [
    message.from,
    message.sender,
    message.senderProfile,
    message.fromAddress
  ];

  let fromDisplay = "";
  let fromEmail = "";
  for (const source of senderSources) {
    const details = extractSenderDetails(source);
    if (!fromDisplay && details.display) {
      fromDisplay = details.display;
    }
    if (!fromEmail && details.email) {
      fromEmail = details.email;
    }
    if (fromDisplay && fromEmail) {
      break;
    }
  }

  const fullBody = extractBodyText(message);

  const snippet =
    asNonEmptyString(message.snippet) ||
    asNonEmptyString(message.preview) ||
    asNonEmptyString(message.bodyPreview) ||
    truncateBody(fullBody) ||
    "";

  const receivedAt =
    asNonEmptyString(message.receivedAt) ||
    asNonEmptyString(message.sentAt) ||
    asNonEmptyString(message.internalDate) ||
    asNonEmptyString(message.received) ||
    asNonEmptyString(message.sent) ||
    asNonEmptyString(message.created) ||
    asNonEmptyString(message.updated) ||
    "";

  return {
    id,
    threadId: asNonEmptyString(message.threadId),
    subject,
    from: fromDisplay || fromEmail || "Unknown sender",
    fromEmail,
    snippet,
    receivedAt,
    body: fullBody
  };
}

// helper(s) sourced from lib modules above

export default function App() {
  const [error, setError] = useState(null);
  const [activeCredentialId, setActiveCredentialId] = useState("");
  const [activeCredentialLabel, setActiveCredentialLabel] = useState("");
  const [activeCredentialEmail, setActiveCredentialEmail] = useState("");
  const [messages, setMessages] = useState([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [messagesError, setMessagesError] = useState(null);
  const [expandedMessageId, setExpandedMessageId] = useState("");

  const fetchToken = useCallback(async () => {
    try {
      setError(null);
      return await requestRolloutToken();
    } catch (err) {
      setError(err);
      throw err;
    }
  }, []);

  const loadInbox = useCallback(
    async (credentialId, { token: existingToken, credentialEmail: explicitCredentialEmail } = {}) => {
      const trimmedId = typeof credentialId === "string" ? credentialId.trim() : "";
      if (!trimmedId) {
        return;
      }

      setIsLoadingMessages(true);
      setMessagesError(null);

      try {
        const authToken = existingToken || (await fetchToken());

        const accumulated = [];
        let nextToken = "";
        let pageCount = 0;
        const maxPages = 5; // safety cap to avoid long loops
        const desired = DEFAULT_MESSAGE_LIMIT;

        const filterEmail =
          extractEmailAddress(explicitCredentialEmail) ||
          activeCredentialEmail ||
          extractEmailAddress(activeCredentialLabel);

        while (accumulated.length < desired && pageCount < maxPages) {
          const messagesUrl = new URL(`${rolloutEmailApiBaseUrl()}/emailMessages`);
          messagesUrl.searchParams.set("limit", String(desired));
          if (nextToken) {
            messagesUrl.searchParams.set("next", nextToken);
          }

          const response = await fetch(messagesUrl.toString(), {
            headers: {
              Authorization: `Bearer ${authToken}`,
              "x-rollout-credential-id": trimmedId
            }
          });

          if (!response.ok) {
            const payload = await response.json().catch(() => null);
            // eslint-disable-next-line no-console
            console.error("Inbox fetch failed:", {
              status: response.status,
              statusText: response.statusText,
              payload
            });
            const message =
              payload?.error ||
              payload?.message ||
              `Failed to load messages (status ${response.status}).`;
            throw new Error(message);
          }

          const payload = await response.json().catch(() => null);
          const rawMessages = extractMessageList(payload);
          const normalized = rawMessages.map(normalizeMessage);
          const filtered =
            filterEmail && filterEmail.length > 0
              ? normalized.filter((m) => !emailsMatch(m.fromEmail, filterEmail))
              : normalized;

          accumulated.push(...filtered);

          nextToken = extractNextToken(payload);
          pageCount += 1;
          if (!nextToken) {
            break;
          }
        }

        // Sort newest-first and take only desired count
        const sorted = accumulated
          .sort((a, b) => {
            const aTime = a.receivedAt ? new Date(a.receivedAt).getTime() : 0;
            const bTime = b.receivedAt ? new Date(b.receivedAt).getTime() : 0;
            return bTime - aTime;
          })
          .slice(0, desired);

        setMessagesError(null);
        setMessages(sorted);
        setExpandedMessageId("");
      } catch (err) {
        setMessages([]);
        setMessagesError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsLoadingMessages(false);
      }
    },
    [activeCredentialEmail, activeCredentialLabel, fetchToken]
  );

  const handleCredentialAdded = useCallback(
    async (credentialData) => {
      const credentialId = credentialData?.id;
      if (!credentialId) {
        // eslint-disable-next-line no-console
        console.warn("Credential added event missing `id` field:", credentialData);
        return;
      }

      const label = resolveCredentialLabel(credentialData) || credentialId;
      const credentialEmail = deriveCredentialEmail(credentialData, label);

      setActiveCredentialId(credentialId);
      setActiveCredentialLabel(label);
      setActiveCredentialEmail(credentialEmail);
      setMessages([]);
      setMessagesError(null);

      try {
        await loadInbox(credentialId, { credentialEmail });
      } catch (err) {
        // loadInbox already handles state; this catch is defensive.
        // eslint-disable-next-line no-console
        console.error("Failed to load inbox for credential:", err);
      }
    },
    [loadInbox]
  );

  const fetchExistingCredential = useCallback(async () => {
    try {
      const token = await fetchToken();
      const credentialsUrl = new URL(CREDENTIALS_API_URL);
      credentialsUrl.searchParams.set("appKey", TARGET_CONNECTOR_APP_KEY);
      credentialsUrl.searchParams.set("includeProfile", "true");
      credentialsUrl.searchParams.set("includeData", "true");

      const response = await fetch(credentialsUrl.toString(), {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        // eslint-disable-next-line no-console
        console.error("Failed to load existing credentials:", {
          status: response.status,
          statusText: response.statusText,
          payload
        });
        return;
      }

      const payload = await response.json().catch(() => null);
      const credentialList = extractCredentialList(payload);
      const gmailCredential =
        credentialList.find((credential) => credential?.appKey === TARGET_CONNECTOR_APP_KEY) ||
        credentialList[0];

      if (gmailCredential?.id) {
        const credentialId = gmailCredential.id;
        const label = resolveCredentialLabel(gmailCredential) || credentialId;
        const credentialEmail = deriveCredentialEmail(gmailCredential, label);
        setActiveCredentialId(credentialId);
        setActiveCredentialLabel(label);
        setActiveCredentialEmail(credentialEmail);
        setMessages([]);
        setMessagesError(null);
        await loadInbox(credentialId, { token, credentialEmail });
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Error while fetching existing Gmail credential:", err);
    }
  }, [fetchToken, loadInbox]);

  useEffect(() => {
    void fetchExistingCredential();
  }, [fetchExistingCredential]);

  const handleRefreshInbox = useCallback(() => {
    if (activeCredentialId) {
      void loadInbox(activeCredentialId, { credentialEmail: activeCredentialEmail });
    }
  }, [activeCredentialEmail, activeCredentialId, loadInbox]);

  const handleMessageToggle = useCallback((messageId) => {
    setExpandedMessageId((current) => (current === messageId ? "" : messageId));
  }, []);

  const handleMessageKeyDown = useCallback(
    (event, messageId) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        handleMessageToggle(messageId);
      }
    },
    [handleMessageToggle]
  );

  const handleReply = useCallback(
    async (message) => {
      const to = message.fromEmail || extractEmailAddress(message.from) || "";
      const originalSubject = message.subject || "";
      const replySubject = originalSubject.trim().toLowerCase().startsWith("re:")
        ? originalSubject
        : `Re: ${originalSubject}`;

      let resolvedThreadId = asNonEmptyString(message.threadId);

      // If threadId is missing, try to hydrate it from the message details endpoint
      if (!resolvedThreadId && message.id && activeCredentialId) {
        try {
          const token = await fetchToken();
          const url = new URL(`${rolloutEmailApiBaseUrl()}/emailMessages/${encodeURIComponent(message.id)}`);
          const response = await fetch(url.toString(), {
            headers: {
              Authorization: `Bearer ${token}`,
              "x-rollout-credential-id": activeCredentialId
            }
          });
          if (response.ok) {
            const payload = await response.json().catch(() => null);
            const fetchedThreadId = asNonEmptyString(payload?.threadId);
            if (fetchedThreadId) {
              resolvedThreadId = fetchedThreadId;
            }
          }
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn("Failed to hydrate message threadId:", e);
        }
      }

      // If still missing, attempt to create a thread with the original subject
      if (!resolvedThreadId && activeCredentialId) {
        try {
          const token = await fetchToken();
          const createUrl = new URL(`${rolloutEmailApiBaseUrl()}/email-threads`);
          const createRes = await fetch(createUrl.toString(), {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
              "x-rollout-credential-id": activeCredentialId
            },
            body: JSON.stringify({ subject: originalSubject || "(no subject)" })
          });
          if (createRes.ok) {
            const created = await createRes.json().catch(() => null);
            const newThreadId = asNonEmptyString(created?.id);
            if (newThreadId) {
              resolvedThreadId = newThreadId;
            }
          } else {
            // eslint-disable-next-line no-console
            console.warn("Thread create failed with status", createRes.status);
          }
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn("Failed to create thread:", e);
        }
      }

      const detail = { to, subject: replySubject };
      if (resolvedThreadId) {
        detail.threadId = resolvedThreadId;
      }

      window.dispatchEvent(new CustomEvent("compose:reply", { detail }));
    },
    [activeCredentialId, fetchToken]
  );

  const hasMessages = messages.length > 0;
  

  return (
    <div className="app-shell">
      <header>
        <h1>Email Demo</h1>
        <p>A demo app showcasing Rollout's universal API for email.</p>
      </header>
      <main>
        {error && <p className="error">{error.message}</p>}
        <RolloutLinkProvider token={fetchToken}>
          <CredentialsManager
            includeData={true}
            entitiesToSync={{ emailMessages: true }}
            onCredentialAdded={handleCredentialAdded}
            shouldRenderConnector={(connector) =>
              connector.appKey === TARGET_CONNECTOR_APP_KEY
            }
          />
        </RolloutLinkProvider>

        <ComposeForm
          activeCredentialId={activeCredentialId}
          activeCredentialLabel={activeCredentialLabel}
          activeCredentialEmail={activeCredentialEmail}
          onSent={() => {
            if (activeCredentialId) {
              void loadInbox(activeCredentialId, { credentialEmail: activeCredentialEmail });
            }
          }}
        />

        {activeCredentialId ? (
          <Inbox
            activeCredentialLabel={activeCredentialLabel}
            messages={messages}
            isLoading={isLoadingMessages}
            error={messagesError}
            onRefresh={handleRefreshInbox}
            expandedMessageId={expandedMessageId}
            onToggleExpand={handleMessageToggle}
            onReply={handleReply}
          />
        ) : (
          <section className="inbox">
            <header className="inbox__header">
              <div className="inbox__title">
                <h2>Inbox</h2>
              </div>
            </header>
            <p className="inbox__empty">Connect an email credential to view the inbox.</p>
          </section>
        )}
      </main>
    </div>
  );
}
