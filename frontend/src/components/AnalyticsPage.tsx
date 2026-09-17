import { useEffect, useState, type ReactNode } from "react";
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
  MessageCircle,
  MoreVertical,
  Paperclip,
  RefreshCw,
  Search,
  Send,
  Settings,
  Sheet,
  Sparkles,
  Star,
  TrendingUp,
  Users,
  Workflow,
  Zap,
} from "lucide-react";
import { Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import "./styles.css";

type KPI = {
  label: string;
  value: string | number;
  change: string;
  icon?: React.ReactNode;
};

type PerformanceData = {
  date: string;
  conversations: number;
  leads: number;
  revenue: number;
};

type Channel = {
  name: string;
  percentage: number;
  color: string;
};

function AnalyticsPage() {
  const [selectedTab, setSelectedTab] = useState("Overview");

  useEffect(() => {
    // Data loading would happen here
  }, []);

  const kpiData: KPI[] = [
    { label: "Total Conversations", value: "532", change: "+18.2%" },
    { label: "Conversion Rate", value: "24.1%", change: "+7.3%" },
    { label: "Revenue", value: "$48,750", change: "+21.3%" },
    { label: "Meetings Booked", value: "32", change: "+14.8%" },
  ];

  const channels: Channel[] = [
    { name: "Website", percentage: 45, color: "#57f287" },
    { name: "Live Chat", percentage: 30, color: "#7b61ff" },
    { name: "Email", percentage: 15, color: "#ffad3d" },
    { name: "Social Media", percentage: 10, color: "#ff506e" },
  ];

  const tabLabels = ["Overview", "Conversations", "Leads", "Revenue", "Performance"];

  return (
    <section className="dashboard-main">
      <header className="dashboard-header">
        <div>
          <h1>Analytics</h1>
          <p>Performance analysis and insights</p>
        </div>
        <div className="header-actions">
          <button className="glass-button"><Calendar size={17} /></button>
          <button className="primary-button">Export</button>
        </div>
      </header>

      <div>
        <div style={{ marginBottom: "24px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
            {kpiData.map((kpi, index) => (
              <div key={index} style={{ background: "rgba(255,255,255,0.05)", borderRadius: "16px", padding: "20px" }}>
                <div style={{ fontSize: "24px", fontWeight: "bold", color: "#fff", marginBottom: "4px" }}>{kpi.value}</div>
                <div style={{ fontSize: "12px", color: "#8892b0", marginTop: "4px" }}>{kpi.label}</div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px" }}>
                  <span style={{ color: "#8892b0", fontSize: "12px" }}>{kpi.change}</span>
                  <span style={{ color: "#8892b0", fontSize: "12px" }}>{kpi.icon}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ marginBottom: "24px" }}>
        <div style={{ display: "flex", gap: "4px", background: "rgba(255,255,255,0.05)", borderRadius: "16px", padding: "8px" }}>
          {tabLabels.map((tab, index) => (
            <button
              key={tab}
              style={{
                padding: "8px 16px",
                border: "none",
                background: selectedTab === tab ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.05)",
                color: "#fff",
                borderRadius: "12px",
                cursor: "pointer",
                fontWeight: "500",
                transition: "background 0.2s ease",
              }}
              onClick={() => setSelectedTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div>
        {selectedTab === "Overview" && (
          <div>
            <Panel title="Top Performing Channels">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={channels} dataKey="percentage" innerRadius={54} outerRadius={78}>
                    {channels.map((channel) => (
                      <Cell key={channel.name} fill={channel.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div style={{ marginTop: "16px", textAlign: "center" }}>
                <span style={{ color: "#fff", fontSize: "24px" }}>532 Total</span>
              </div>
            </Panel>

            <Panel title="Conversion Funnel">
              <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: "16px", padding: "20px", height: "200px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <div style={{ flex: 1, marginBottom: "16px" }}>
                  <strong>Visitors 2,450</strong>
                  <span style={{ color: "#8892b0", fontSize: "12px" }}>(21.7%)</span>
                </div>
                <div style={{ flex: 1, marginBottom: "16px", borderLeft: "4px solid #57f287", paddingLeft: "16px" }}>
                  <strong>Conversations 532</strong>
                  <span style={{ color: "#8892b0", fontSize: "12px" }}>(24.1%)</span>
                </div>
                <div style={{ flex: 1, marginBottom: "16px", borderLeft: "4px solid #7b61ff", paddingLeft: "16px" }}>
                  <strong>Leads 128</strong>
                  <span style={{ color: "#8892b0", fontSize: "12px" }}>(25.0%)</span>
                </div>
                <div style={{ flex: 1, marginBottom: "16px", borderLeft: "4px solid #ffad3d", paddingLeft: "16px" }}>
                  <strong>Meetings 32</strong>
                  <span style={{ color: "#8892b0", fontSize: "12px" }}>(37.5%)</span>
                </div>
                <div style={{ flex: 1, borderLeft: "4px solid #ff506e", paddingLeft: "16px" }}>
                  <strong>Customers 12</strong>
                  <span style={{ color: "#8892b0", fontSize: "12px" }}>(37.5%)</span>
                </div>
              </div>
            </Panel>
          </div>
        )}

        {selectedTab === "Conversations" && (
          <Panel title="Conversation Analytics">
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={[
                { date: "Day 1", conversations: 15, leads: 5 },
                { date: "Day 2", conversations: 20, leads: 8 },
                { date: "Day 3", conversations: 18, leads: 6 },
                { date: "Day 4", conversations: 25, leads: 10 },
                { date: "Day 5", conversations: 22, leads: 7 },
                { date: "Day 6", conversations: 28, leads: 9 },
                { date: "Day 7", conversations: 30, leads: 12 },
              ]}>
                <XAxis dataKey="date" tick={{ fill: "#b9d7ff", fontSize: "11" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: "#b9d7ff", fontSize: "11" }} tickLine={false} axisLine={false} width={32} />
                <Tooltip contentStyle={{ background: "#101a44", border: "1px solid rgba(255,255,255,.2)", color: "#fff" }} />
                <Line type="monotone" dataKey="conversations" stroke="#5ab7ff" strokeWidth={3} dot={false} />
                <Line type="monotone" dataKey="leads" stroke="#57f287" strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Panel>
        )}

        {selectedTab === "Leads" && (
          <Panel title="Lead Analytics">
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={[
                { date: "Day 1", conversations: 15, leads: 5 },
                { date: "Day 2", conversations: 20, leads: 8 },
                { date: "Day 3", conversations: 18, leads: 6 },
                { date: "Day 4", conversations: 25, leads: 10 },
                { date: "Day 5", conversations: 22, leads: 7 },
                { date: "Day 6", conversations: 28, leads: 9 },
                { date: "Day 7", conversations: 30, leads: 12 },
              ]}>
                <XAxis dataKey="date" tick={{ fill: "#b9d7ff", fontSize: "11" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: "#b9d7ff", fontSize: "11" }} tickLine={false} axisLine={false} width={32} />
                <Tooltip contentStyle={{ background: "#101a44", border: "1px solid rgba(255,255,255,.2)", color: "#fff" }} />
                <Line type="monotone" dataKey="conversations" stroke="#5ab7ff" strokeWidth={3} dot={false} />
                <Line type="monotone" dataKey="leads" stroke="#57f287" strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Panel>
        )}

        {selectedTab === "Revenue" && (
          <Panel title="Revenue Analytics">
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={[
                { date: "Day 1", conversations: 15, leads: 5, revenue: 2500 },
                { date: "Day 2", conversations: 20, leads: 8, revenue: 3200 },
                { date: "Day 3", conversations: 18, leads: 6, revenue: 2800 },
                { date: "Day 4", conversations: 25, leads: 10, revenue: 4100 },
                { date: "Day 5", conversations: 22, leads: 7, revenue: 3500 },
                { date: "Day 6", conversations: 28, leads: 9, revenue: 4800 },
                { date: "Day 7", conversations: 30, leads: 12, revenue: 5200 },
              ]}>
                <XAxis dataKey="date" tick={{ fill: "#b9d7ff", fontSize: "11" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: "#b9d7ff", fontSize: "11" }} tickLine={false} axisLine={false} width={32} />
                <Tooltip contentStyle={{ background: "#101a44", border: "1px solid rgba(255,255,255,.2)", color: "#fff" }} />
                <Line type="monotone" dataKey="revenue" stroke="#57f287" strokeWidth={3} dot={false} />
                <Line type="monotone" dataKey="revenue" stroke="#5ab7ff" strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Panel>
        )}

        {selectedTab === "Performance" && (
          <Panel title="Performance Trend">
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={[
                { date: "Day 1", conversations: 15, leads: 5, revenue: 2500 },
                { date: "Day 2", conversations: 20, leads: 8, revenue: 3200 },
                { date: "Day 3", conversations: 18, leads: 6, revenue: 2800 },
                { date: "Day 4", conversations: 25, leads: 10, revenue: 4100 },
                { date: "Day 5", conversations: 22, leads: 7, revenue: 3500 },
                { date: "Day 6", conversations: 28, leads: 9, revenue: 4800 },
                { date: "Day 7", conversations: 30, leads: 12, revenue: 5200 },
              ]}>
                <XAxis dataKey="date" tick={{ fill: "#b9d7ff", fontSize: "11" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: "#b9d7ff", fontSize: "11" }} tickLine={false} axisLine={false} width={32} />
                <Tooltip contentStyle={{ background: "#101a44", border: "1px solid rgba(255,255,255,.2)", color: "#fff" }} />
                <Line type="monotone" dataKey="conversations" stroke="#5ab7ff" strokeWidth={3} dot={false} />
                <Line type="monotone" dataKey="leads" stroke="#7b61ff" strokeWidth={3} dot={false} />
                <Line type="monotone" dataKey="revenue" stroke="#57f287" strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Panel>
        )}
      </div>
    </section>
  );
}

function Panel({ title, className = "", children }: { title?: string; className?: string; children: ReactNode }) {
  return <article className={`panel ${className}`}>{title && <h2>{title}</h2>}{children}</article>;
}

export default AnalyticsPage;