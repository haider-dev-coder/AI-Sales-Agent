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
import "./styles.css";

type Lead = {
  id: string;
  full_name: string | null;
  email: string | null;
  company_name: string | null;
  phone: string | null;
  website_url: string | null;
  industry: string | null;
  required_services: string[] | null;
  lead_score: string | null;
  status: string | null;
  assigned_to: string | null;
  follow_up_date: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type LeadDetail = Lead & {
  conversation_history: { role: string; content: string; created_at: string }[];
};

type SourceFilter = "All" | "Website" | "Social Media" | "Referral" | "Cold Call" | "Event";
type StatusFilter = "All" | "Hot" | "Warm" | "Cold" | "Qualified" | "Closed";

const apiUrl = (import.meta.env.VITE_API_URL ?? `${window.location.protocol}//${window.location.hostname}:8001`).replace(/\/$/, "");

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`);
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.detail || `Request failed (HTTP ${response.status})`);
  }
  return (await response.json()) as T;
}

function fmtDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : "—";
}

function getLeadScoreColor(score: number) {
  if (score >= 70) return "#22c55e";
  if (score >= 40) return "#f59e0b";
  return "#ef4444";
}

// The API returns `lead_score` as a temperature label (Hot/Warm/Cold), never a
// numeric `lead_temperature` column, so the UI must derive the label instead of
// reading a non-existent field (which rendered as "Cold" for every lead).
function temperatureFromScore(score?: string | null): string {
  const value = (score || "").trim().toLowerCase();
  if (!value) return "Cold";
  if (value.startsWith("hot")) return "Hot";
  if (value.startsWith("warm")) return "Warm";
  if (value.startsWith("cold")) return "Cold";
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return "Cold";
  if (parsed >= 70) return "Hot";
  if (parsed >= 40) return "Warm";
  return "Cold";
}

function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLead, setSelectedLead] = useState<LeadDetail | null>(null);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("All");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson<Lead[]>("/api/leads");
      setLeads(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load leads");
    } finally {
      setLoading(false);
    }
  }

  async function loadLeadDetail(leadId: string) {
    setDetailLoading(true);
    try {
      const data = await fetchJson<LeadDetail>(`/api/leads/${leadId}`);
      setSelectedLead(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load lead details");
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filteredLeads = leads.filter((lead) => {
    const matchesSource = sourceFilter === "All" || (lead.website_url && lead.website_url.includes("http") ? "Website" : "Other") === sourceFilter;
    const matchesStatus = statusFilter === "All" || temperatureFromScore(lead.lead_score) === statusFilter;
    const haystack = `${lead.full_name || ""} ${lead.company_name || ""} ${lead.email || ""}`.toLowerCase();
    const matchesSearch = haystack.includes(searchQuery.toLowerCase());
    return matchesSource && matchesStatus && matchesSearch;
  });

  const handleAddLead = () => {
    alert("Add Lead modal would open here");
  };

  return (
    <section className="dashboard-main">
      <header className="dashboard-header">
        <div>
          <h1>Leads</h1>
          <p>Manage and qualify sales leads from real database</p>
        </div>
        <div className="header-actions">
          <button className="glass-button" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={17} /> Refresh
          </button>
          <button className="primary-button" onClick={() => handleAddLead()}>
            <Sparkles size={18} /> Add Lead
          </button>
        </div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "24px" }}>
        {/* Left: Lead List Panel */}
        <div>
          <div style={{ marginBottom: "24px" }}>
            <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
              <select
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "16px",
                  padding: "8px 16px",
                  color: "#fff",
                  minWidth: "150px",
                  appearance: "none",
                }}
                value={sourceFilter}
                onChange={(e) => setSourceFilter((e.target as HTMLSelectElement).value as SourceFilter)}
              >
                <option value="All">All Sources</option>
                <option value="Website">Website</option>
                <option value="Social Media">Social Media</option>
                <option value="Referral">Referral</option>
                <option value="Cold Call">Cold Call</option>
                <option value="Event">Event</option>
              </select>

              <select
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "16px",
                  padding: "8px 16px",
                  color: "#fff",
                  minWidth: "150px",
                  appearance: "none",
                }}
                value={statusFilter}
                onChange={(e) => setStatusFilter((e.target as HTMLSelectElement).value as StatusFilter)}
              >
                <option value="All">All Status</option>
                <option value="Hot">Hot</option>
                <option value="Warm">Warm</option>
                <option value="Cold">Cold</option>
                <option value="Qualified">Qualified</option>
                <option value="Closed">Closed</option>
              </select>
            </div>

            <div style={{ display: "flex", gap: "8px" }}>
              <Search size={16} />
              <input
                style={{
                  flex: 1,
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "16px",
                  padding: "8px 16px",
                  color: "#fff",
                  fontSize: "14px",
                }}
                placeholder="Search leads..."
                value={searchQuery}
                onChange={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
              />
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ color: "#fff", background: "rgba(255,255,255,0.05)", borderRadius: "16px", padding: "12px" }}>
                  <th style={{ width: "30%", padding: "12px" }}>Name</th>
                  <th style={{ width: "25%", padding: "12px" }}>Email</th>
                  <th style={{ width: "15%", padding: "12px" }}>Source</th>
                  <th style={{ width: "12%", padding: "12px" }}>Status</th>
                  <th style={{ width: "12%", padding: "12px" }}>Lead Score</th>
                  <th style={{ width: "15%", padding: "12px" }}>Assigned To</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={6} style={{ padding: "24px", textAlign: "center", color: "#8892b0" }}>
                      Loading leads…
                    </td>
                  </tr>
                )}
                {!loading && error && (
                  <tr>
                    <td colSpan={6} style={{ padding: "24px", textAlign: "center", color: "#ff506e" }}>
                      {error}
                    </td>
                  </tr>
                )}
                {!loading && !error && filteredLeads.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: "24px", textAlign: "center", color: "#8892b0" }}>
                      No leads found matching current filters.
                    </td>
                  </tr>
                )}
                {filteredLeads.map((lead) => (
                  <tr
                    key={lead.id}
                    style={{
                      background: "rgba(255,255,255,0.05)",
                      borderRadius: "16px",
                      margin: "8px 0",
                      transition: "background 0.2s ease",
                    }}
                    onClick={() => void loadLeadDetail(lead.id)}
                  >
                    <td style={{ padding: "12px" }}>
                      <strong>{lead.full_name || "Unknown"}</strong>
                    </td>
                    <td style={{ padding: "12px" }}>{lead.email || "—"}</td>
                    <td style={{ padding: "12px" }}>
                      <span
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                          background: "rgba(255,255,255,0.1)",
                          borderRadius: "20px",
                          padding: "4px 8px",
                          color: "#8892b0",
                          fontSize: "12px",
                        }}
                      >
                        {lead.website_url && lead.website_url.includes("http") ? "Website" : "Other"}
                      </span>
                    </td>
                    <td style={{ padding: "12px" }}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          background: "rgba(255,255,255,0.1)",
                          borderRadius: "20px",
                          padding: "4px 8px",
                          color: getLeadScoreColor(parseInt(lead.lead_score || "0")),
                          fontWeight: "500",
                          fontSize: "12px",
                        }}
                      >
                        {temperatureFromScore(lead.lead_score)}
                      </span>
                    </td>
                    <td style={{ padding: "12px" }}>
                      <div style={{ height: "8px", background: "rgba(255,255,255,0.1)", borderRadius: "4px", overflow: "hidden" }}>
                        <div
                          style={{
                            height: "100%",
                            width: `${Math.min(parseInt(lead.lead_score || "0"), 100)}%`,
                            background: getLeadScoreColor(parseInt(lead.lead_score || "0")),
                            transition: "width 0.3s ease",
                          }}
                        ></div>
                      </div>
                      <span style={{ marginLeft: "8px", color: "#8892b0", fontSize: "12px" }}>{lead.lead_score || "0"}/100</span>
                    </td>
                    <td style={{ padding: "12px" }}>
                      <span style={{ color: "#8892b0", fontSize: "12px" }}>{lead.assigned_to || "Unassigned"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Lead Details Panel */}
        <div>
          <Panel title="Lead Details">
            {detailLoading ? (
              <div style={{ textAlign: "center", padding: "48px", color: "#8892b0" }}>
                Loading lead details…
              </div>
            ) : selectedLead ? (
              <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: "16px", padding: "24px", minHeight: "300px" }}>
                <div style={{ marginBottom: "16px" }}>
                  <strong>{selectedLead.full_name || "Unknown"}</strong>
                  <p style={{ color: "#8892b0", fontSize: "14px", marginTop: "4px" }}>{selectedLead.company_name || "No company"}</p>
                </div>
                <div style={{ display: "grid", gap: "12px", marginBottom: "16px" }}>
                  <div><span className="muted">Email</span><br />{selectedLead.email || "—"}</div>
                  <div><span className="muted">Phone</span><br />{selectedLead.phone || "—"}</div>
                  <div><span className="muted">Website</span><br />{selectedLead.website_url || "—"}</div>
                  <div><span className="muted">Industry</span><br />{selectedLead.industry || "—"}</div>
                  <div><span className="muted">Source</span><br />{selectedLead.website_url && selectedLead.website_url.includes("http") ? "Website" : "Other"}</div>
                  <div><span className="muted">Industry</span><br />{selectedLead.industry || "—"}</div>
                  <div><span className="muted">Lead Score</span><br /><strong style={{ color: getLeadScoreColor(parseInt(selectedLead.lead_score || "0")) }}>{selectedLead.lead_score || "0"}/100</strong></div>
                  <div><span className="muted">Temperature</span><br /><span style={{ color: getLeadScoreColor(parseInt(selectedLead.lead_score || "0")) }}>{temperatureFromScore(selectedLead.lead_score)}</span></div>
                  <div><span className="muted">Status</span><br /><strong>{selectedLead.status || "New"}</strong></div>
                  <div><span className="muted">Assigned To</span><br />{selectedLead.assigned_to || "Unassigned"}</div>
                  <div><span className="muted">Follow Up</span><br />{fmtDate(selectedLead.follow_up_date)}</div>
                  <div><span className="muted">Created</span><br />{fmtDate(selectedLead.created_at)}</div>
                </div>

                {selectedLead.required_services && selectedLead.required_services.length > 0 && (
                  <div style={{ marginTop: "16px" }}>
                    <span className="muted">Required Services</span>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" }}>
                      {selectedLead.required_services.map((service) => (
                        <span key={service} style={{ background: "rgba(255,255,255,0.1)", borderRadius: "20px", padding: "4px 10px", fontSize: "12px", color: "#fff" }}>
                          {service}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Conversation History */}
                {selectedLead.conversation_history && selectedLead.conversation_history.length > 0 && (
                  <div style={{ marginTop: "24px" }}>
                    <h3 style={{ color: "#fff", fontSize: "14px", marginBottom: "12px" }}>Conversation History</h3>
                    <div className="messages" style={{ maxHeight: "300px", overflow: "auto" }}>
                      {selectedLead.conversation_history.map((msg, idx) => (
                        <p key={idx} className={`bubble ${msg.role === "visitor" || msg.role === "user" ? "inbound" : "outbound"}`}>
                          {msg.content}
                          <small style={{ display: "block", color: "#8892b0", fontSize: "10px", marginTop: "4px" }}>{fmtDate(msg.created_at)}</small>
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="muted" style={{ margin: 0, textAlign: "center", padding: "48px" }}>
                Select a lead from the list to view details and conversation history.
              </p>
            )}
          </Panel>
        </div>
      </div>
    </section>
  );
}

function Panel({ title, className = "", children }: { title?: string; className?: string; children: ReactNode }) {
  return <article className={`panel ${className}`}>{title && <h2>{title}</h2>}{children}</article>;
}

export default LeadsPage;