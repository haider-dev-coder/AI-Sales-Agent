import { useEffect, useState, type ReactNode } from "react";
import {
  RefreshCw,
  Calendar,
  TrendingUp,
  Users,
  MessageCircle,
  BarChart3,
  Star,
  Workflow,
  type LucideIcon,
} from "lucide-react";
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
};

type Overview = {
  conversations: number;
  leads: number;
  conversion_rate: number;
  meetings_booked: number;
  revenue_pipeline: number;
  trends: Record<string, number>;
};

type TimelinePoint = { date: string; conversations: number; leads: number };
type TempData = { hot: number; warm: number; cold: number; total: number };
type ServiceData = { service: string; count: number; percentage: number };
type ActivityItem = { type: string; description: string; name?: string; time: string };

const emptyOverview: Overview = {
  conversations: 0,
  leads: 0,
  conversion_rate: 0,
  meetings_booked: 0,
  revenue_pipeline: 0,
  trends: {},
};

const apiUrl = (import.meta.env.VITE_API_URL ?? `${window.location.protocol}//${window.location.hostname}:8001`).replace(/\/$/, "");

async function fetchJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(`${apiUrl}${path}`);
    if (!response.ok) return fallback;
    return (await response.json()) as T;
  } catch {
    return fallback;
  }
}

function WebsiteAnalytics() {
  const [overview, setOverview] = useState<Overview>(emptyOverview);
  const [visitors, setVisitors] = useState<VisitorAnalytics | null>(null);
  const [timeline, setTimeline] = useState<TimelinePoint[]>([]);
  const [temps, setTemps] = useState<TempData>({ hot: 0, warm: 0, cold: 0, total: 0 });
  const [services, setServices] = useState<ServiceData[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const [overviewData, visitorsData, timelineData, tempsData, servicesData, activityData] = await Promise.all([
        fetchJson<Overview>("/api/analytics/overview", emptyOverview),
        fetchJson<VisitorAnalytics | null>("/api/analytics/visitors", null),
        fetchJson<TimelinePoint[]>("/api/analytics/timeline", []),
        fetchJson<TempData>("/api/analytics/leads-by-temp", { hot: 0, warm: 0, cold: 0, total: 0 }),
        fetchJson<ServiceData[]>("/api/analytics/services", []),
        fetchJson<ActivityItem[]>("/api/analytics/recent-activity", []),
      ]);
      setOverview(overviewData);
      setVisitors(visitorsData);
      setTimeline(timelineData);
      setTemps(tempsData);
      setServices(servicesData);
      setActivity(activityData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  // Tuple-annotated so `Icon` is a component type rather than a widened union
  // (string | number | LucideIcon), which broke `key`/JSX usage at the call site.
  const kpis: [string, string | number, LucideIcon][] = visitors ? [
    ["Total Visitors", visitors.total_visitors, Users],
    ["Conversations", visitors.total_conversations, MessageCircle],
    ["Messages", visitors.total_messages, MessageCircle],
    ["Leads Captured", visitors.leads_captured, Users],
  ] : [
    ["Total Visitors", 0, Users],
    ["Conversations", 0, MessageCircle],
    ["Messages", 0, MessageCircle],
    ["Leads Captured", 0, Users],
  ];

  return (
    <section className="dashboard-main">
      <header className="dashboard-header">
        <div>
          <h1>Website Analytics</h1>
          <p>Real analytics from your website visitors and conversations</p>
        </div>
        <div className="header-actions">
          <button className="glass-button" disabled={loading} onClick={() => void refresh()}>
            <RefreshCw size={17} /> Refresh
          </button>
        </div>
      </header>

      {loading && <p className="muted">Loading analytics…</p>}

      {error && (
        <div className="panel">
          <p style={{ color: "#ff506e", margin: 0 }}>{error}</p>
          <button className="glass-button" style={{ marginTop: 12 }} onClick={() => void refresh()}>
            <RefreshCw size={16} /> Retry
          </button>
        </div>
      )}

      {!loading && !error && (
        <>
          <section className="kpi-row">
            {kpis.map(([label, value, Icon]) => (
              <article className="kpi-card" key={label}>
                <Icon size={27} />
                <p>{label}</p>
                <strong>{typeof value === "number" ? value.toLocaleString() : value}</strong>
              </article>
            ))}
          </section>

          <section className="middle-grid">
            <Panel title="Conversation Analytics">
              <ResponsiveContainer width="100%" height={178}>
                <LineChart data={timeline}>
                  <XAxis dataKey="date" tick={{ fill: "#b9d7ff", fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: "#b9d7ff", fontSize: 11 }} tickLine={false} axisLine={false} width={32} />
                  <Tooltip contentStyle={{ background: "#101a44", border: "1px solid rgba(255,255,255,.2)" }} />
                  <Line type="monotone" dataKey="conversations" stroke="#5ab7ff" strokeWidth={3} dot={false} />
                  <Line type="monotone" dataKey="leads" stroke="#57f287" strokeWidth={3} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </Panel>
            <Panel title="Leads by Temperature">
              <div className="donut-wrap">
                <PieChart width={170} height={170}>
                  <Pie data={[{ name: "Hot", value: temps.hot }, { name: "Warm", value: temps.warm }, { name: "Cold", value: temps.cold }]} dataKey="value" innerRadius={54} outerRadius={78}>
                    {["#ff4f78", "#ffb443", "#2f8cff"].map((color) => <Cell key={color} fill={color} />)}
                  </Pie>
                </PieChart>
                <div className="donut-center"><strong>{temps.total}</strong><span>Total Leads</span></div>
                <div className="legend"><span><i className="hot" /> Hot {temps.hot}</span><span><i className="warm" /> Warm {temps.warm}</span><span><i className="cold" /> Cold {temps.cold}</span></div>
              </div>
            </Panel>
            <Panel title="Top Requested Services">
              <div className="service-list">
                {services.length === 0 && <p className="muted">No service requests yet.</p>}
                {services.map((item) => (
                  <div className="service-row" key={item.service}>
                    <span>{item.service}</span>
                    <div><b style={{ width: `${item.percentage}%` }} /></div>
                    <em>{item.count} ({item.percentage}%)</em>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel title="Recent Activity">
              <div className="activity-list">
                {activity.length === 0 && <p className="muted">No recent activity yet.</p>}
                {activity.map((item, index) => (
                  <div className="activity-row" key={`${item.type}-${index}`}>
                    <ActivityIcon type={item.type} />
                    <p><strong>{item.description}</strong><span>{item.name}</span></p>
                    <time>{item.time}</time>
                  </div>
                ))}
              </div>
            </Panel>
          </section>

          <section className="bottom-grid">
            <Panel title="Visitor Timeline (Last 30 Days)">
              {visitors && visitors.timeline.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={visitors.timeline}>
                    <XAxis dataKey="date" tick={{ fill: "#b9d7ff", fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fill: "#b9d7ff", fontSize: 11 }} tickLine={false} axisLine={false} width={32} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: "#101a44", border: "1px solid rgba(255,255,255,.2)" }} />
                    <Line type="monotone" dataKey="visitors" stroke="#57f287" strokeWidth={3} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="muted">No visitor data available yet.</p>
              )}
            </Panel>

            <Panel title="Languages">
              {visitors && visitors.languages.length > 0 ? (
                <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                  <PieChart width={170} height={170}>
                    <Pie data={visitors.languages} dataKey="count" nameKey="language" innerRadius={54} outerRadius={78}>
                      {visitors.languages.map((_, index) => (
                        <Cell key={index} fill={["#57f287", "#7b61ff", "#ffad3d", "#5ab7ff", "#ff506e"][index % 5]} />
                      ))}
                    </Pie>
                  </PieChart>
                  <div className="legend">
                    {visitors.languages.map((item, index) => (
                      <span key={item.language}>
                        <i style={{ background: ["#57f287", "#7b61ff", "#ffad3d", "#5ab7ff", "#ff506e"][index % 5] }} /> {item.language} ({item.count})
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="muted">No language data available yet.</p>
              )}
            </Panel>

            <Panel title="Conversations by Status">
              {visitors && visitors.by_status.length > 0 ? (
                <div className="service-list">
                  {visitors.by_status.map((item) => (
                    <div className="service-row" key={item.status}>
                      <span>{item.status}</span>
                      <div><b style={{ width: `${Math.min(100, (item.count / Math.max(1, visitors.total_conversations)) * 100)}%` }} /></div>
                      <em>{item.count}</em>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">No conversation data available yet.</p>
              )}
            </Panel>
          </section>

          <section className="bottom-grid">
            <Panel title="Traffic Sources">
              <p className="muted">Traffic source tracking is not configured. No referrer data has been recorded.</p>
            </Panel>
            <Panel title="Visitor Geography">
              <p className="muted">Geolocation tracking is not configured. No country data has been recorded.</p>
            </Panel>
            <Panel title="Top Pages">
              <p className="muted">Page view tracking is not configured. No page view data has been recorded.</p>
            </Panel>
          </section>
        </>
      )}
    </section>
  );
}

function ActivityIcon({ type }: { type: string }) {
  if (type.includes("meeting")) return <Calendar className="blue" size={20} />;
  if (type.includes("lead")) return <Users className="green" size={20} />;
  if (type.includes("crawl")) return <Workflow className="purple" size={20} />;
  return <Star className="yellow" size={20} />;
}

function KpiRow({ overview }: { overview: Overview }) {
  const cards: [string, string | number, string, LucideIcon][] = [
    ["Conversations", overview.conversations, "conversations_pct", MessageCircle],
    ["Leads", overview.leads, "leads_pct", Users],
    ["Conversion Rate", `${overview.conversion_rate.toFixed(1)}%`, "conversion_pct", TrendingUp],
    ["Meetings Booked", overview.meetings_booked, "meetings_pct", Calendar],
    ["Revenue Pipeline", `$${overview.revenue_pipeline.toFixed(0)}`, "revenue_pct", BarChart3],
  ] as const;
  return <section className="kpi-row">{cards.map(([label, value, trendKey, Icon]) => <article className="kpi-card" key={label}><Icon size={27} /><p>{label}</p><strong>{value}</strong><span><TrendingUp size={14} /> {overview.trends?.[trendKey]?.toFixed?.(1) ?? "0.0"}%</span><small>vs previous 30 days</small></article>)}</section>;
}

function Panel({ title, className = "", children }: { title?: string; className?: string; children: ReactNode }) {
  return <article className={`panel ${className}`}>{title && <h2>{title}</h2>}{children}</article>;
}

export default WebsiteAnalytics;