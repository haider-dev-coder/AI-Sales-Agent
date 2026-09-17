import {
  Activity,
  BarChart3,
  Bot,
  Calendar,
  ChevronDown,
  CircleHelp,
  FileText,
  Filter,
  Home,
  Layers,
  Mail,
  Menu,
  MessageCircle,
  MoreVertical,
  Paperclip,
  RefreshCw,
  Search,
  Send,
  Settings,
  Sheet,
  Smile,
  Sparkles,
  Star,
  TrendingUp,
  Users,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import "./styles.css";

const apiUrl = (import.meta.env.VITE_API_URL ?? `${window.location.protocol}//${window.location.hostname}:8001`).replace(/\/$/, "");
const wsUrl = apiUrl.replace(/^http/, "ws");

type Overview = {
  conversations: number;
  leads: number;
  conversion_rate: number;
  meetings_booked: number;
  revenue_pipeline: number;
  trends: Record<string, number>;
};
// Mirrors the real GET /api/leads response shape (see backend/app/api/leads.py).
type Lead = {
  id?: string;
  full_name?: string;
  company_name?: string;
  email?: string;
  phone?: string;
  website_url?: string;
  industry?: string;
  required_services?: string[];
  lead_score?: string;
  status?: string;
  assigned_to?: string;
  notes?: string;
  created_at?: string;
};
type LeadDetail = Lead & {
  follow_up_date?: string;
  conversation_history?: { role: string; content: string; created_at?: string }[];
};
type TimelinePoint = { date: string; conversations: number; leads: number };
type TempData = { hot: number; warm: number; cold: number; total: number };
type ServiceData = { service: string; count: number; percentage: number };
type ActivityItem = { type: string; description: string; name?: string; time: string };
type IntegrationStatus = { calcom: boolean; mailjet: boolean; sheets: boolean; supabase: boolean };
type VisitorData = {
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
type Message = { role: "visitor" | "agent"; text: string };

const emptyOverview: Overview = {
  conversations: 0,
  leads: 0,
  conversion_rate: 0,
  meetings_booked: 0,
  revenue_pipeline: 0,
  trends: {},
};

const emptyVisitors: VisitorData = {
  total_visitors: 0,
  total_conversations: 0,
  total_messages: 0,
  leads_captured: 0,
  avg_messages_per_conversation: 0,
  timeline: [],
  languages: [],
  by_status: [],
  sources: [],
  countries: [],
  top_pages: [],
};

/**
 * Normalize a lead's temperature. The backend stores the Hot/Warm/Cold label in
 * `lead_score` for agent-captured leads; numeric scores are mapped to bands.
 */
function leadTemperature(lead?: Lead): "hot" | "warm" | "cold" {
  const raw = String(lead?.lead_score ?? "").trim().toLowerCase();
  if (raw.startsWith("hot")) return "hot";
  if (raw.startsWith("warm")) return "warm";
  if (raw.startsWith("cold")) return "cold";
  const numeric = Number(raw);
  if (raw !== "" && !Number.isNaN(numeric)) {
    if (numeric >= 6) return "hot";
    if (numeric >= 3) return "warm";
  }
  return "cold";
}

function initials(name?: string) {
  return (name || "Lead")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function money(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0, style: "currency", currency: "USD" }).format(value || 0);
}

async function getJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(`${apiUrl}${path}`);
    if (!response.ok) return fallback;
    return (await response.json()) as T;
  } catch {
    return fallback;
  }
}

// Page components
import WebsiteAnalytics from "./components/WebsiteAnalytics";
import CrawlManagement from "./components/CrawlsPage";
import LeadDetailsPage from "./components/LeadDetailsPage";
import IntegrationSettings from "./components/IntegrationSettings";
import ConversationPage from "./components/ConversationPage";
import LeadsPage from "./components/LeadsPage";
import AppointmentsPage from "./components/AppointmentsPage";
import VisitorsPage from "./components/VisitorsPage";
import WebsitePage from "./components/WebsitePage";
import SitemapPage from "./components/SitemapPage";
import ServicesPage from "./components/ServicesPage";
import FaqsPage from "./components/FaqsPage";
import KnowledgeBasePage from "./components/KnowledgeBasePage";
import SettingsPage from "./components/SettingsPage";
import FollowUpsPage from "./components/FollowUpsPage";

function App() {
  const [overview, setOverview] = useState<Overview>(emptyOverview);
  const [timeline, setTimeline] = useState<TimelinePoint[]>([]);
  const [temps, setTemps] = useState<TempData>({ hot: 0, warm: 0, cold: 0, total: 0 });
  const [services, setServices] = useState<ServiceData[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [integrations, setIntegrations] = useState<IntegrationStatus>({ calcom: false, mailjet: false, sheets: false, supabase: false });
  const [visitors, setVisitors] = useState<VisitorData>(emptyVisitors);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadDetail, setLeadDetail] = useState<LeadDetail | undefined>();
  const [selectedLeadsId, setSelectedLeadsId] = useState<string | undefined>();
  const [days, setDays] = useState(30);
  const [currentPage, setCurrentPage] = useState<string>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  function handlePageChange(page: string) {
    setCurrentPage(page);
    setSidebarOpen(false);
  }

  // Every analytics read is scoped by the selected date range (?days=...).
  const refresh = useCallback(async () => {
    const query = `days=${days}`;
    const [overviewData, timelineData, tempData, servicesData, activityData, integrationData, leadData, visitorData] = await Promise.all([
      getJson<Overview>(`/api/analytics/overview?${query}`, emptyOverview),
      getJson<TimelinePoint[]>(`/api/analytics/timeline?${query}`, []),
      getJson<TempData>(`/api/analytics/leads-by-temp?${query}`, { hot: 0, warm: 0, cold: 0, total: 0 }),
      getJson<ServiceData[]>(`/api/analytics/services?${query}`, []),
      getJson<ActivityItem[]>(`/api/analytics/recent-activity?${query}`, []),
      getJson<IntegrationStatus>("/api/integrations/status", { calcom: false, mailjet: false, sheets: false, supabase: false }),
      getJson<Lead[]>("/api/leads", []),
      getJson<VisitorData>(`/api/analytics/visitors?${query}`, emptyVisitors),
    ]);
    setOverview(overviewData);
    setTimeline(timelineData);
    setTemps(tempData);
    setServices(servicesData);
    setActivity(activityData);
    setIntegrations(integrationData);
    setLeads(leadData);
    setVisitors(visitorData);
    setSelectedLeadsId((current) => current ?? leadData[0]?.id);
  }, [days]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Close the mobile navigation drawer when leaving the mobile breakpoint
  useEffect(() => {
    if (!sidebarOpen) return;
    const handleResize = () => {
      if (window.innerWidth >= 768) setSidebarOpen(false);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [sidebarOpen]);

  const selectedLeads = leads.find((item) => item.id === selectedLeadsId) ?? leads[0];

  // Full lead record (including conversation history) for the selected lead.
  useEffect(() => {
    const id = selectedLeads?.id;
    if (!id) {
      setLeadDetail(undefined);
      return;
    }
    let cancelled = false;
    void (async () => {
      const detail = await getJson<LeadDetail | null>(`/api/leads/${id}`, null);
      if (!cancelled) setLeadDetail(detail ?? undefined);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedLeads?.id]);

  // Page rendering based on current tab
  const pageContent = () => {
    switch (currentPage) {
      case "analytics":
        return (
          <section className="dashboard-main">
            <header className="dashboard-header">
              <div>
                <h1>Website Analytics</h1>
                <p>Overview of your website performance</p>
              </div>
              <div className="header-actions">
                <DateRangeFilter days={days} onChange={setDays} />
                <button className="glass-button" onClick={() => void refresh()}><RefreshCw size={17} /> Refresh</button>
              </div>
            </header>
            <KpiRow overview={overview} days={days} />
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
                  {services.map((item) => <div className="service-row" key={item.service}><span>{item.service}</span><div><b style={{ width: `${item.percentage}%` }} /></div><em>{item.count} ({item.percentage}%)</em></div>)}
                </div>
              </Panel>
              <Panel title="Recent Activity">
                <div className="activity-list">
                  {activity.length === 0 && <p className="muted">No recent activity yet.</p>}
                  {activity.map((item, index) => <div className="activity-row" key={`${item.type}-${index}`}><ActivityIcon type={item.type} /><p><strong>{item.description}</strong><span>{item.name}</span></p><time>{item.time}</time></div>)}
                </div>
              </Panel>
            </section>
            <section className="bottom-grid">
              <Panel title="Visitor Summary">
                <div className="field"><span>Unique Visitors</span><strong>{visitors.total_visitors}</strong></div>
                <div className="field"><span>Conversations</span><strong>{visitors.total_conversations}</strong></div>
                <div className="field"><span>Messages</span><strong>{visitors.total_messages}</strong></div>
                <div className="field"><span>Avg. Messages / Conversation</span><strong>{visitors.avg_messages_per_conversation}</strong></div>
                <div className="field"><span>Leads Captured</span><strong>{visitors.leads_captured}</strong></div>
              </Panel>
              <Panel title="Languages">
                <div className="service-list">
                  {visitors.languages.length === 0 && <p className="muted">No language data yet.</p>}
                  {visitors.languages.map((item) => (
                    <div className="service-row" key={item.language}>
                      <span>{item.language}</span>
                      <div><b style={{ width: `${visitors.total_conversations ? (item.count / visitors.total_conversations) * 100 : 0}%` }} /></div>
                      <em>{item.count}</em>
                    </div>
                  ))}
                </div>
              </Panel>
              <Panel title="Conversation Status">
                <div className="service-list">
                  {visitors.by_status.length === 0 && <p className="muted">No conversation status data yet.</p>}
                  {visitors.by_status.map((item) => (
                    <div className="service-row" key={item.status}>
                      <span>{item.status}</span>
                      <div><b style={{ width: `${visitors.total_conversations ? (item.count / visitors.total_conversations) * 100 : 0}%` }} /></div>
                      <em>{item.count}</em>
                    </div>
                  ))}
                </div>
              </Panel>
            </section>
          </section>
        );
      case "crawls":
        return <CrawlManagement />;
      case "leads":
        return <LeadsPage />;
      case "integrations":
        return <IntegrationSettings />;
      case "knowledge":
        // Renders the real Knowledge Base page (no placeholder statistics).
        return <KnowledgeBasePage />;
      case "conversations":
        return <ConversationPage />;
      case "leads-list":
        return <LeadsPage />;
      case "appointments":
        return <AppointmentsPage />;
      case "visitors":
        return <VisitorsPage />;
      case "website":
        return <WebsitePage />;
      case "sitemap":
        return <SitemapPage />;
      case "services":
        return <ServicesPage />;
      case "faqs":
        return <FaqsPage />;
      case "knowledge-base":
        return <KnowledgeBasePage />;
      case "settings":
        return <SettingsPage />;
      case "follow-ups":
        return <FollowUpsPage />;
      default:
        return (
          <section className="dashboard-main">
            <header className="dashboard-header">
              <div>
                <h1>Dashboard</h1>
                <p>Overview of your AI Sales Agent performance</p>
              </div>
              <div className="header-actions">
                <DateRangeFilter days={days} onChange={setDays} />
                <button className="glass-button" onClick={() => void refresh()}><RefreshCw size={17} /> Refresh</button>
                <button className="primary-button"><Sparkles size={18} /> New Crawl</button>
              </div>
            </header>
            <KpiRow overview={overview} days={days} />
            <section className="middle-grid">
              <ConversationList leads={leads} selectedId={selectedLeads?.id} onSelect={setSelectedLeadsId} />
              <ChatPanel lead={selectedLeads} detail={leadDetail} />
              <LeadInfoPanel lead={selectedLeads} detail={leadDetail} />
            </section>
            <section className="bottom-grid">
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
                  {services.map((item) => <div className="service-row" key={item.service}><span>{item.service}</span><div><b style={{ width: `${item.percentage}%` }} /></div><em>{item.count} ({item.percentage}%)</em></div>)}
                </div>
              </Panel>
              <Panel title="Recent Activity">
                {activity.length === 0 && <p className="muted">No recent activity yet.</p>}
                {activity.map((item, index) => <div className="activity-row" key={`${item.type}-${index}`}><ActivityIcon type={item.type} /><p><strong>{item.description}</strong><span>{item.name}</span></p><time>{item.time}</time></div>)}
              </Panel>
            </section>
            <section className="bottom-grid">
              <Panel title="Visitor Summary">
                <div className="field"><span>Unique Visitors</span><strong>{visitors.total_visitors}</strong></div>
                <div className="field"><span>Conversations</span><strong>{visitors.total_conversations}</strong></div>
                <div className="field"><span>Messages</span><strong>{visitors.total_messages}</strong></div>
                <div className="field"><span>Avg. Messages / Conversation</span><strong>{visitors.avg_messages_per_conversation}</strong></div>
                <div className="field"><span>Leads Captured</span><strong>{visitors.leads_captured}</strong></div>
              </Panel>
              <Panel title="Languages">
                <div className="service-list">
                  {visitors.languages.length === 0 && <p className="muted">No language data yet.</p>}
                  {visitors.languages.map((item) => (
                    <div className="service-row" key={item.language}>
                      <span>{item.language}</span>
                      <div><b style={{ width: `${visitors.total_conversations ? (item.count / visitors.total_conversations) * 100 : 0}%` }} /></div>
                      <em>{item.count}</em>
                    </div>
                  ))}
                </div>
              </Panel>
              <Panel title="Conversation Status">
                <div className="service-list">
                  {visitors.by_status.length === 0 && <p className="muted">No conversation status data yet.</p>}
                  {visitors.by_status.map((item) => (
                    <div className="service-row" key={item.status}>
                      <span>{item.status}</span>
                      <div><b style={{ width: `${visitors.total_conversations ? (item.count / visitors.total_conversations) * 100 : 0}%` }} /></div>
                      <em>{item.count}</em>
                    </div>
                  ))}
                </div>
              </Panel>
            </section>
          </section>
        );
    }
  };

  return (
    <main className="dashboard-shell">
      <Sidebar
        currentPage={currentPage}
        onPageChange={handlePageChange}
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((value) => !value)}
        onClose={() => setSidebarOpen(false)}
      />
      {pageContent()}
      <ChatWidget />
    </main>
  );
}

function KpiRow({ overview, days }: { overview: Overview; days: number }) {
  const cards = [
    ["Conversations", overview.conversations, "conversations_pct", MessageCircle],
    ["Leads", overview.leads, "leads_pct", Users],
    ["Conversion Rate", `${overview.conversion_rate.toFixed(1)}%`, "conversion_pct", TrendingUp],
    ["Meetings Booked", overview.meetings_booked, "meetings_pct", Calendar],
    ["Revenue Pipeline", money(overview.revenue_pipeline), "revenue_pct", BarChart3],
  ] as const;
  return <section className="kpi-row">{cards.map(([label, value, trendKey, Icon]) => <article className="kpi-card" key={label}><Icon size={27} /><p>{label}</p><strong>{value}</strong><span><TrendingUp size={14} /> {overview.trends?.[trendKey]?.toFixed?.(1) ?? "0.0"}%</span><small>vs previous {days} days</small></article>)}</section>;
}

function DateRangeFilter({ days, onChange }: { days: number; onChange: (days: number) => void }) {
  return (
    <label className="glass-button" style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <Calendar size={17} />
      <select
        value={days}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label="Date range"
        style={{ background: "transparent", border: "none", color: "inherit", font: "inherit", outline: "none", cursor: "pointer" }}
      >
        <option value={7}>Last 7 days</option>
        <option value={30}>Last 30 days</option>
        <option value={90}>Last 90 days</option>
      </select>
      <ChevronDown size={15} />
    </label>
  );
}

function Sidebar({ currentPage, onPageChange, open, onToggle, onClose }: { currentPage: string; onPageChange: (page: string) => void; open: boolean; onToggle: () => void; onClose: () => void }) {
  const groups = [
    ["CONVERSATIONS", [["dashboard", "Dashboard", Home], ["conversations", "Conversations", MessageCircle], ["leads", "Leads", Users], ["appointments", "Appointments", Calendar], ["visitors", "Visitors", Users], ["analytics", "Analytics", BarChart3]]],

    ["KNOWLEDGE", [["website", "Website", Workflow], ["crawls", "Crawls", Workflow], ["sitemap", "Sitemap", Layers], ["services", "Services", Zap], ["faqs", "FAQs", CircleHelp], ["knowledge-base", "Knowledge Base", FileText]]],

    ["SETTINGS", [["sales-reps", "Sales Reps", Users], ["follow-ups", "Follow-ups", Calendar], ["settings", "Settings", Settings]]],
  ] as const;
  return (
    <>
      <button type="button" className="menu-toggle" aria-label={open ? "Close navigation menu" : "Open navigation menu"} aria-expanded={open} onClick={onToggle}>
        {open ? <X size={22} /> : <Menu size={22} />}
      </button>
      <div className={open ? "sidebar-overlay visible" : "sidebar-overlay"} onClick={onClose} aria-hidden="true" />
      <aside className={open ? "sidebar open" : "sidebar"}>
        <div className="brand"><span><Bot size={20} /></span><strong>AI Sales Agent</strong></div>
        {groups.map(([title, items]) => (
          <nav key={title}>
            <h2>{title}</h2>
            {items.map(([id, label, Icon]) => (
              <a key={id} className={currentPage === id ? "active" : ""} onClick={() => onPageChange(id)}>
                <Icon size={18} />
                <span>{label}</span>
              </a>
            ))}
          </nav>
        ))}
        <div className="admin"><span>SA</span><p><strong>Super Admin</strong><small>admin@example.com</small></p></div>
      </aside>
    </>
  );
}

function ConversationList({ leads, selectedId, onSelect }: { leads: Lead[]; selectedId?: string; onSelect: (id?: string) => void }) {
  return <Panel className="conversation-list"><div className="search-row"><Search size={16} /><input placeholder="Search conversations..." /><Filter size={16} /></div><div className="tabs"><button>All</button><button>Open</button><button>Closed</button></div><div className="lead-list">{leads.length === 0 && <p className="muted">No leads captured yet.</p>}{leads.map((lead) => <button className={lead.id === selectedId ? "lead-item selected" : "lead-item"} key={lead.id} onClick={() => onSelect(lead.id)}><span>{initials(lead.full_name)}</span><p><strong>{lead.full_name || "Unnamed lead"}</strong><small>{lead.company_name || lead.email || "Captured lead"}</small></p><em>{lead.status || "open"}</em></button>)}</div></Panel>;
}

function ChatPanel({ lead, detail }: { lead?: Lead; detail?: LeadDetail }) {
  const history = detail?.conversation_history ?? [];
  return <Panel className="chat-panel"><header><span className="avatar">{initials(lead?.full_name)}</span><div><strong>{lead?.full_name || "No active conversation"}</strong><small>{lead?.email || "No email captured"}</small></div><i className="status-dot" /> <span>{lead?.status || "Open"}</span><MoreVertical size={18} /></header><div className="messages">{history.length === 0 && <p className="muted">No stored conversation for this lead yet.</p>}{history.map((message, index) => <p className={`bubble ${message.role === "assistant" ? "outbound" : "inbound"}`} key={`${message.role}-${index}`}>{message.content}</p>)}</div><footer><input placeholder="Type your message..." /><Paperclip size={18} /><Smile size={18} /><button><Send size={18} /></button><small>AI can make mistakes. Please verify important information.</small></footer></Panel>;
}

function LeadInfoPanel({ lead, detail }: { lead?: Lead; detail?: LeadDetail }) {
  if (!lead) {
    return <Panel className="lead-panel" title="Lead Information"><p className="muted">Select a lead to view its details.</p></Panel>;
  }
  const temp = leadTemperature(lead);
  const services = detail?.required_services ?? lead.required_services ?? [];
  const score = Number(lead.lead_score);
  return (
    <Panel className="lead-panel" title="Lead Information">
      <span className={`temp-badge ${temp}`}>{temp[0].toUpperCase() + temp.slice(1)} Lead</span>
      <div className="field"><span>name</span><strong>{lead.full_name || "-"}</strong></div>
      <div className="field"><span>email</span><strong>{lead.email || "-"}</strong></div>
      <div className="field"><span>phone</span><strong>{lead.phone || "-"}</strong></div>
      <div className="field"><span>company</span><strong>{lead.company_name || "-"}</strong></div>
      <div className="field"><span>industry</span><strong>{lead.industry || "-"}</strong></div>
      <div className="field"><span>website</span><strong>{lead.website_url || "-"}</strong></div>
      <div className="field"><span>Required Services</span><strong className="tags">{services.length === 0 ? <i>None captured</i> : services.map((service) => <i key={service}>{service}</i>)}</strong></div>
      <div className="field"><span>Lead Score</span><strong>{lead.lead_score || "0"}</strong></div>
      {!Number.isNaN(score) && <div className="scorebar"><b style={{ width: `${Math.min(score, 100)}%` }} /></div>}
      <div className="field"><span>Temperature</span><strong><i className={`temp-dot ${temp}`} /> {temp}</strong></div>
      <div className="field"><span>Assigned To</span><strong>{lead.assigned_to || "Unassigned"}</strong></div>
      <div className="followup"><Calendar size={17} /> Next Follow-up <strong>{detail?.follow_up_date ? new Date(detail.follow_up_date).toLocaleString() : "-"}</strong></div>
      <div className="field"><span>Conversation History</span><strong>{detail?.conversation_history?.length ?? 0} messages</strong></div>
    </Panel>
  );
}

function Panel({ title, className = "", children }: { title?: string; className?: string; children: ReactNode }) {
  return <article className={`panel ${className}`}>{title && <h2>{title}</h2>}{children}</article>;
}

function ActivityIcon({ type }: { type: string }) {
  if (type.includes("meeting")) return <Calendar className="blue" size={20} />;
  if (type.includes("lead")) return <Users className="green" size={20} />;
  if (type.includes("crawl")) return <Workflow className="purple" size={20} />;
  return <Star className="yellow" size={20} />;
}

function ChatWidget() {
  const sessionId = useMemo(() => {
    const existing = localStorage.getItem("ai-sales-session-id");
    if (existing) return existing;
    const created = crypto.randomUUID();
    localStorage.setItem("ai-sales-session-id", created);
    return created;
  }, []);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([{ role: "agent", text: "Hi. How can I help today?" }]);
  const [typing, setTyping] = useState(false);
  const [progress, setProgress] = useState(0);
  const [slots, setSlots] = useState<{ start: string; end?: string }[]>([]);
  const [bookingBusy, setBookingBusy] = useState(false);
  // Who is actually booking. Populated from the agent's `booking` payload so the
  // Cal.com invite and confirmation email reach the real visitor instead of a
  // placeholder identity.
  const [visitor, setVisitor] = useState<{ name?: string; email?: string; company?: string }>({});

  async function bookSlot(slot: { start: string }) {
    if (bookingBusy) return;
    const name = (visitor.name || "").trim();
    const email = (visitor.email || "").trim();
    // Never create a Cal.com booking against invented details - ask in chat instead.
    if (!name || !email) {
      setSlots([]);
      setMessages((items) => [...items, {
        role: "agent",
        text: "I just need your name and email to lock that slot in - could you share them here?",
      }]);
      return;
    }
    setBookingBusy(true);
    try {
      const response = await fetch(`${apiUrl}/api/cal/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          start_time: slot.start,
          conversation_id: sessionId,
        }),
      });
      const data = (await response.json()) as { status?: string; confirmation_url?: string; detail?: string };
      setSlots([]);
      const confirmation =
        data.status === "confirmed"
          ? `Your meeting is confirmed for ${new Date(slot.start).toLocaleString()}.${
              data.confirmation_url ? ` Details: ${data.confirmation_url}` : ""
            }`
          : `I couldn't confirm that slot automatically (${data.detail || "unknown error"}). Our team will follow up to lock it in.`;
      setMessages((items) => [...items, { role: "agent", text: confirmation }]);
    } catch {
      setMessages((items) => [...items, { role: "agent", text: "Booking is temporarily unavailable. Please try again shortly." }]);
    } finally {
      setBookingBusy(false);
    }
  }

  function updateProgress(text: string) {
    const checks = [/\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/, /company|inc|llc/i, /[\w.+-]+@[\w-]+\.[\w.-]+/, /\+?\d[\d\s().-]{7,}/, /https?:\/\/|www\./i, /industry|sector/i, /service|seo|ppc|marketing|design/i];
    setProgress((current) => Math.max(current, checks.filter((regex) => regex.test(text)).length));
  }

  function send(event?: { preventDefault: () => void }) {
    // Never let a click or Enter key bubble up and submit/reload the page.
    event?.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput("");
    setTyping(true);
    updateProgress(text);
    setMessages((items) => [...items, { role: "visitor", text }, { role: "agent", text: "" }]);
    // Protocol (see backend/app/api/websocket.py):
    //   client -> {"message": text}
    //   server -> {"type":"token","token":"..."} (repeated) then {"type":"done",...}
    // `received` = got at least one token; `completed` = got the terminal "done".
    const socket = new WebSocket(`${wsUrl}/ws/chat/${sessionId}`);
    let received = false;
    let completed = false;
    socket.onopen = () => socket.send(JSON.stringify({ message: text }));
    socket.onmessage = (event) => {
      const raw = event.data;
      // Tolerate the legacy single-frame shape {"response": "..."} too.
      const data = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (data.type === "token") {
        received = true;
        setMessages((items) => items.map((item, index) => (index === items.length - 1 ? { ...item, text: item.text + data.token } : item)));
        return;
      }
      if (data.type === "done") {
        completed = true;
        setTyping(false);
        setSlots(Array.isArray(data.slots) ? data.slots : []);
        if (data.booking && typeof data.booking === "object") {
          setVisitor(data.booking as { name?: string; email?: string; company?: string });
        }
        socket.close();
        return;
      }
      if (data.response) {
        received = true;
        completed = true;
        setMessages((items) => items.map((item, index) => (index === items.length - 1 ? { ...item, text: String(data.response) } : item)));
        setTyping(false);
        socket.close();
      }
    };
    socket.onerror = () => {
      socket.close();
      if (!completed) void sendFallback(text, received);
    };
    // If the socket closes without a terminal "done", don't leave the widget
    // stuck on "typing": fall back to HTTP (only if nothing was rendered).
    socket.onclose = () => {
      if (completed) return;
      if (received) { setTyping(false); return; }
      void sendFallback(text, false);
    };
  }

  async function sendFallback(text: string, skip: boolean) {
    if (skip) return;
    try {
      const response = await fetch(`${apiUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, conversation_id: sessionId }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as { message?: string; slots?: { start: string; end?: string }[] };
      setSlots(Array.isArray(data.slots) ? data.slots : []);
      setMessages((items) => items.map((item, index) => (index === items.length - 1 ? { ...item, text: data.message || "" } : item)));
    } catch {
      setMessages((items) => items.map((item, index) => (index === items.length - 1 ? { ...item, text: "Chat is not connected. Please check the backend." } : item)));
    } finally {
      setTyping(false);
    }
  }

  return (
    <div className="widget">
      <button type="button" className="widget-toggle" onClick={() => setOpen((value) => !value)}><Bot size={20} /></button>
      {open && (
        <section className="widget-window">
          <header>
            <strong>AI Sales Agent</strong>
            <span>{progress}/7</span>
          </header>
          <div className="progress">
            <b style={{ width: `${(progress / 7) * 100}%` }} /></div>
          <div className="widget-log">
            {messages.map((message, index) => <p className={message.role} key={index}>{message.text}</p>)}
            {typing && <small className="typing"><i /><i /><i /></small>}
          </div>
          {slots.length > 0 && (
            <div className="slot-list" style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "0 10px 8px" }}>
              {slots.map((slot) => (
                <button
                  key={slot.start}
                  type="button"
                  className="glass-button"
                  disabled={bookingBusy}
                  onClick={() => void bookSlot(slot)}
                >
                  {new Date(slot.start).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}
                </button>
              ))}
            </div>
          )}
          <footer>
            {/* onSubmit + preventDefault guarantees Enter cannot navigate/reload.
                display:contents keeps the input/button as the footer grid items. */}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                send(event);
              }}
              style={{ display: "contents" }}
            >
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Type your message..."
                aria-label="Chat message"
              />
              <button type="submit" aria-label="Send message"><Send size={17} /></button>
            </form>
          </footer>
        </section>
      )}
    </div>
  );
}

export default App;