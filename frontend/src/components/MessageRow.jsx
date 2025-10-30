import { formatMessageTimestamp } from "../lib/emailUtils";

export default function MessageRow({ message, expanded, onToggle, onReply }) {
  return (
    <article
      className={`message-row${expanded ? " message-row--expanded" : ""}`}
      role="listitem"
      tabIndex={0}
      aria-expanded={expanded}
      onClick={() => onToggle(message.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onToggle(message.id);
        }
      }}
    >
      <div className="message-row__from">{message.from || "Unknown sender"}</div>
      <div className="message-row__content">
        <span className="message-row__subject">{message.subject}</span>
        {message.snippet && (
          <>
            <span className="message-row__separator"> – </span>
            <span className="message-row__snippet">{message.snippet}</span>
          </>
        )}
      </div>
      <div className="message-row__meta">
        {message.receivedAt && (
          <time dateTime={message.receivedAt}>{formatMessageTimestamp(message.receivedAt)}</time>
        )}
        <button
          type="button"
          className="message-row__reply"
          aria-label="Reply"
          onClick={(e) => {
            e.stopPropagation();
            onReply?.(message);
          }}
        >
          Reply
        </button>
      </div>
      {expanded && (
        <div className="message-row__body">
          {message.body || message.snippet || "No additional content available."}
        </div>
      )}
    </article>
  );
}

