import { useEffect, useState, type ReactNode } from "react";
import { MessageCircle, TrendingUp, Users } from "lucide-react";
import { Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import "./styles.css";

type VisitorAnalytics = {
  total_visitors: number;
  total_conversations: number;
  total_messages: number;
  leads_captured: number;
  avg_messages_per_conversation: number;
  timeline: { date: string; visitors: number }[];
  languages: { language: string; count: number }[];
  by_status: { status: string; count: number }[];
  sources: unknown[];
  countries: unknown[];
  top_pages: unknown[];
};

const apiUrl = (import.meta.env.VITE_API_URL ?? `${window.location.protocol}//${window.location.hostname}:8001`).replace(/\/$/, "");

const PIE_COLORS = ["#57f287", "#7b61ff", "#ffad3d", "#5ab7ff", "#ff506e"];

function VisitorsPage() {
  const [data, setData] = useState<VisitorAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${apiUrl}/api/analytics/visitors`);
      if (!response.ok) throw new Error(`Failed to load visitor analytics (HTTP ${response.status})`);
      setData((await response.json()) as VisitorAnalytics);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : "Failed to load visitor analytics");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const kpis: [string, string | number][] = data
    ? [
        ["Total Visitors", data.total_visitors],
        ["Conversations", data.total_conversations],
        ["Messages", data.total_messages],
        ["Leads Captured", data.leads_captured],
        ["Avg. Messages / Conversation", data.avg_messages_per_conversation],
      ]
    : [];

  return (
    <section className="dashboard-main">
      <header className="dashboard-header">
        <div>
          <h1>Visitors</h1>
          <p>Real visitor analytics from chat conversations</p>
        </div>
        <div className="header-actions">
          <button className="glass-button" onClick={() => void load()} disabled={loading}>
            <TrendingUp size={17} /> Refresh
          </button>
        </div>
      </header>

      {loading && <p className="muted">Loading visitor analytics…</p>}

      {error && !loading && (
        <div className="panel">
          <p style={{ color: "#ff506e", margin: 0 }}>{error}</p>
          <button className="glass-button" style={{ marginTop: 12 }} onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}

      {!loading && !error && data && (
        <>
          <section className="kpi-row">
            {kpis.map(([label, value], index) => (
              <article className="kpi-card" key={label}>
                {index % 2 === 0 ? <Users size={27} /> : <MessageCircle size={27} />}
                <p>{label}</p>
                <strong>{value}</strong>
              </article>
            ))}
          </section>

          {data.total_conversations === 0 && (
            <div className="panel">
              <p className="muted" style={{ margin: 0 }}>
                No visitor conversations recorded yet. Visitor analytics appear once visitors start chatting with the AI agent.
              </p>
            </div>
          )}

          {data.total_conversations > 0 && (
            <section className="bottom-grid">
              <Panel title="Visitors per Day (last 30 days)">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={data.timeline}>
                    <XAxis dataKey="date" tick={{ fill: "#b9d7ff", fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fill: "#b9d7ff", fontSize: 11 }} tickLine={false} axisLine={false} width={32} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: "#101a44", border: "1px solid rgba(255,255,255,.2)" }} />
                    <Line type="monotone" dataKey="visitors" stroke="#57f287" strokeWidth={3} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </Panel>

              <Panel title="Visitors by Language">
                {data.languages.length === 0 ? (
                  <p className="muted">No language data recorded yet.</p>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <PieChart width={170} height={170}>
                      <Pie data={data.languages} dataKey="count" nameKey="language" innerRadius={54} outerRadius={78}>
                        {data.languages.map((_, index) => (
                          <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                    </PieChart>
                    <div className="legend">
                      {data.languages.map((item, index) => (
                        <span key={item.language}>
                          <i style={{ background: PIE_COLORS[index % PIE_COLORS.length] }} /> {item.language} ({item.count})
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </Panel>

              <Panel title="Conversations by Status">
                {data.by_status.length === 0 ? (
                  <p className="muted">No conversations recorded yet.</p>
                ) : (
                  <div className="service-list">
                    {data.by_status.map((item) => (
                      <div className="service-row" key={item.status}>
                        <span>{item.status}</span>
                        <div>
                          <b style={{ width: `${Math.min(100, (item.count / Math.max(1, data.total_conversations)) * 100)}%` }} />
                        </div>
                        <em>{item.count}</em>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </section>
          )}

          <section className="bottom-grid">
            <Panel title="Traffic Sources">
              <p className="muted">Traffic source tracking is not configured. No referrer data has been recorded.</p>
            </Panel>
            <Panel title="Visitor Geography">
              <p className="muted">Geolocation tracking is not configured. No country data has been recorded.</p>
            </Panel>
            <Panel title="Top Pages">
              <p className="muted">Page-view tracking is not configured. No page-view data has been recorded.</p>
            </Panel>
          </section>
        </>
      )}
    </section>
  );
}

function Panel({ title, className = "", children }: { title?: string; className?: string; children: ReactNode }) {
  return <article className={`panel ${className}`}>{title && <h2>{title}</h2>}{children}</article>;
}

export default VisitorsPage;
