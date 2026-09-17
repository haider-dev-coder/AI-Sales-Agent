import { useEffect, useState, type ReactNode } from "react";
import { RefreshCw, Search } from "lucide-react";
import "./styles.css";

type ConversationListItem = {
  session_id: string;
  status: string;
  message_count: number;
  last_message: string;
  language: string | null;
  lead_score: string | null;
  lead_name: string | null;
  company_name: string | null;
  lead_email: string | null;
  lead_status: string | null;
  assigned_to: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type ConversationDetail = ConversationListItem & {
  messages: { role: string; content: string }[];
};

const apiUrl = (import.meta.env.VITE_API_URL ?? `${window.location.protocol}//${window.location.hostname}:8001`).replace(/\/$/, "");

function fmtDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : "—";
}

function shortId(sessionId: string) {
  return sessionId.length > 13 ? `${sessionId.slice(0, 8)}…${sessionId.slice(-4)}` : sessionId;
}

const statusColor = (status: string) =>
  status === "closed" || status === "completed" ? "#ff506e" : status === "handoff" ? "#ffad3d" : "#57f287";

function ConversationPage() {
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [repFilter, setRepFilter] = useState("All");
  const [dateFilter, setDateFilter] = useState("All");
  const [selected, setSelected] = useState<ConversationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${apiUrl}/api/conversations`);
      if (!response.ok) throw new Error(`Failed to load conversations (HTTP ${response.status})`);
      setConversations((await response.json()) as ConversationListItem[]);
    } catch (err) {
      setConversations([]);
      setError(err instanceof Error ? err.message : "Failed to load conversations");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function openConversation(sessionId: string) {
    setDetailLoading(true);
    try {
      const response = await fetch(`${apiUrl}/api/conversations/${encodeURIComponent(sessionId)}`);
      if (!response.ok) throw new Error(`Failed to load conversation (HTTP ${response.status})`);
      setSelected((await response.json()) as ConversationDetail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load conversation");
    } finally {
      setDetailLoading(false);
    }
  }

  const statuses = Array.from(new Set(conversations.map((c) => c.status || "active")));
  // The type predicate keeps the Set as string[]; `.filter(Boolean)` alone leaves
  // `(string | null)[]`, which made the <option value={rep}> below a type error.
  const reps = Array.from(
    new Set(conversations.map((c) => c.assigned_to).filter((rep): rep is string => Boolean(rep))),
  );
  const filtered = conversations.filter((conv) => {
    const matchesStatus = statusFilter === "All" || (conv.status || "active") === statusFilter;
    const matchesRep = repFilter === "All" || (conv.assigned_to || "Unassigned") === repFilter;
    const matchesDate = dateFilter === "All" || (() => {
      if (!conv.created_at) return false;
      const convDate = new Date(conv.created_at);
      const now = new Date();
      if (dateFilter === "Today") return convDate.toDateString() === now.toDateString();
      if (dateFilter === "Last 7 Days") return (now.getTime() - convDate.getTime()) < 7 * 24 * 60 * 60 * 1000;
      if (dateFilter === "Last 30 Days") return (now.getTime() - convDate.getTime()) < 30 * 24 * 60 * 60 * 1000;
      return true;
    })();
    const haystack = `${conv.lead_name || ""} ${conv.company_name || ""} ${conv.lead_email || ""} ${conv.last_message || ""} ${conv.session_id}`.toLowerCase();
    return matchesStatus && matchesRep && matchesDate && haystack.includes(searchQuery.toLowerCase());
  });

  return (
    <section className="dashboard-main">
      <header className="dashboard-header">
        <div>
          <h1>Conversations</h1>
          <p>Real conversations recorded in the database</p>
        </div>
        <div className="header-actions">
          <button className="glass-button" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={17} /> Refresh
          </button>
        </div>
      </header>

      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.18)",
            borderRadius: 8,
            padding: "0 14px",
            color: "#fff",
            minHeight: 44,
          }}
        >
          <option value="All">All Statuses</option>
          {statuses.map((status) => (
            <option key={status} value={status}>{status}</option>
          ))}
        </select>
        <select
          value={repFilter}
          onChange={(e) => setRepFilter(e.target.value)}
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.18)",
            borderRadius: 8,
            padding: "0 14px",
            color: "#fff",
            minHeight: 44,
            minWidth: 150,
          }}
        >
          <option value="All">All Reps</option>
          {reps.map((rep) => (
            <option key={rep} value={rep}>{rep}</option>
          ))}
        </select>
        <select
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.18)",
            borderRadius: 8,
            padding: "0 14px",
            color: "#fff",
            minHeight: 44,
            minWidth: 150,
          }}
        >
          <option value="All">All Time</option>
          <option value="Today">Today</option>
          <option value="Last 7 Days">Last 7 Days</option>
          <option value="Last 30 Days">Last 30 Days</option>
        </select>
        <div className="search-row" style={{ flex: 1, minWidth: 220 }}>
          <Search size={16} />
          <input
            placeholder="Search by lead, company, or message…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {loading && <p className="muted">Loading conversations…</p>}

      {error && !loading && (
        <div className="panel">
          <p style={{ color: "#ff506e", margin: 0 }}>{error}</p>
          <button className="glass-button" style={{ marginTop: 12 }} onClick={() => void load()}>
            <RefreshCw size={16} /> Retry
          </button>
        </div>
      )}

      {!loading && !error && conversations.length === 0 && (
        <div className="panel">
          <p className="muted" style={{ margin: 0 }}>
            No conversations recorded yet. Conversations appear here automatically when visitors chat with the AI agent.
          </p>
        </div>
      )}

      {!loading && !error && conversations.length > 0 && (
        <div style={{ display: "grid", gap: 24, gridTemplateColumns: selected ? "minmax(0, 1fr) minmax(320px, 420px)" : "1fr" }}>
          <Panel title={`Conversations (${filtered.length})`}>
            {filtered.length === 0 && <p className="muted">No conversations match the current filters.</p>}
            <div className="lead-list">
              {filtered.map((conv) => (
                <button
                  key={conv.session_id}
                  className={`lead-item ${selected?.session_id === conv.session_id ? "selected" : ""}`}
                  onClick={() => void openConversation(conv.session_id)}
                >
                  <p>
                    <strong>{conv.lead_name || conv.lead_email || `Visitor ${shortId(conv.session_id)}`}</strong>
                    <small>{conv.company_name || conv.session_id}</small>
                  </p>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: "#d7e4ff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {conv.last_message || "No messages yet"}
                    </div>
                    <small style={{ color: "#8892b0" }}>
                      {conv.message_count} messages · {fmtDate(conv.updated_at)}
                      {conv.assigned_to ? ` · ${conv.assigned_to}` : ""}
                    </small>
                  </div>
                  <em style={{ color: statusColor(conv.status || "active"), background: "rgba(255,255,255,0.08)" }}>
                    {conv.status || "active"}
                  </em>
                </button>
              ))}
            </div>
          </Panel>

          {selected && (
            <Panel title={selected.lead_name || selected.lead_email || `Session ${shortId(selected.session_id)}`}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
                {selected.company_name ? `${selected.company_name} · ` : ""}
                Status: {selected.status || "active"} · Started {fmtDate(selected.created_at)}
              </div>
              {detailLoading ? (
                <p className="muted">Loading messages…</p>
              ) : selected.messages.length === 0 ? (
                <p className="muted">No messages stored for this conversation.</p>
              ) : (
                <div className="messages" style={{ maxHeight: 480, overflow: "auto" }}>
                  {selected.messages.map((message, index) => (
                    <p key={index} className={`bubble ${message.role === "user" || message.role === "visitor" ? "inbound" : "outbound"}`}>
                      {message.content}
                    </p>
                  ))}
                </div>
              )}
            </Panel>
          )}
        </div>
      )}
    </section>
  );
}

function Panel({ title, className = "", children }: { title?: string; className?: string; children: ReactNode }) {
  return <article className={`panel ${className}`}>{title && <h2>{title}</h2>}{children}</article>;
}

export default ConversationPage;
