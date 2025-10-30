import MessageRow from "./MessageRow";

export default function Inbox({
  activeCredentialLabel,
  messages,
  isLoading,
  error,
  onRefresh,
  expandedMessageId,
  onToggleExpand,
  onReply
}) {
  const hasMessages = messages.length > 0;
  return (
    <section className="inbox">
      <header className="inbox__header">
        <div className="inbox__title">
          <h2>Inbox</h2>
          {activeCredentialLabel && (
            <span className="inbox__account">{activeCredentialLabel}</span>
          )}
        </div>
        <div className="inbox__actions">
          <button type="button" onClick={onRefresh} disabled={isLoading}>
            {isLoading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>

      {error && <p className="error inbox__error">{error}</p>}
      {!error && !hasMessages && !isLoading && (
        <p className="inbox__empty">No messages to display yet.</p>
      )}
      {isLoading && <p className="inbox__loading">Loading messages…</p>}
      {!error && hasMessages && (
        <div className="message-table" role="list">
          {messages.map((message) => (
            <MessageRow
              key={message.id}
              message={message}
              expanded={expandedMessageId === message.id}
              onToggle={onToggleExpand}
              onReply={onReply}
            />
          ))}
        </div>
      )}
    </section>
  );
}

