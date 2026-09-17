import { useEffect, useState } from "react";
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
  id?: string;
  name?: string;
  company?: string;
  email?: string;
  phone?: string;
  website?: string;
  industry?: string;
  services?: string[];
  score?: number;
  status?: string;
  assigned_to?: string | null;
  follow_up?: string | null;
  lead_temperature?: string;
  created_at?: string;
};

type ConversationMessage = {
  role: "visitor" | "agent";
  text: string;
};

type Overview = {
  conversations: number;
  leads: number;
  conversion_rate: number;
  meetings_booked: number;
  revenue_pipeline: number;
  trends: Record<string, number>;
};

function LeadDetailsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLead, setSelectedLead] = useState<Lead | undefined>();
  const [messages, setMessages] = useState<ConversationMessage[]>([]);

  useEffect(() => {
    const loadLeads = async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      setLeads([
        {
          id: "lead-1",
          name: "Acme Corp",
          company: "Acme Industries",
          email: "contact@acme.com",
          phone: "+1-555-0101",
          website: "https://acme.com",
          industry: "Manufacturing",
          services: ["Web Design", "SEO"],
          score: 85,
          status: "new",
          assigned_to: "John Smith",
          follow_up: "2024-02-15T10:00:00Z",
          lead_temperature: "Hot",
          created_at: "2024-01-20T14:30:00Z",
        },
        {
          id: "lead-2",
          name: "TechStart",
          company: "TechStart Labs",
          email: "hello@techstart.com",
          phone: "+1-555-0202",
          website: "https://techstart.com",
          industry: "Technology",
          services: ["AI Chat", "PPC"],
          score: 67,
          status: "open",
          assigned_to: "Jane Doe",
          follow_up: "2024-02-10T14:00:00Z",
          lead_temperature: "Warm",
          created_at: "2024-01-18T09:15:00Z",
        },
        {
          id: "lead-3",
          name: "Saim Enterprises",
          company: "Saim Enterprises",
          email: "info@saim.com",
          phone: "+1-555-0303",
          website: "https://saim.com",
          industry: "Retail",
          services: ["Web Design"],
          score: 32,
          status: "closed",
          assigned_to: null,
          follow_up: null,
          lead_temperature: "Cold",
          created_at: "2024-01-10T16:45:00Z",
        },
      ]);
    };
    loadLeads();
  }, []);

  useEffect(() => {
    const loadConversation = async () => {
      if (!selectedLead?.id) return;
      await new Promise((resolve) => setTimeout(resolve, 300));
      setMessages([
        { role: "agent", text: "Hi! I see you're interested in our services. How can I help you today?" },
        { role: "visitor", text: "Yes, I'd like to know more about web design pricing." },
        { role: "agent", text: "Our web design packages start at $500 and go up to $5,000 depending on features." },
      ]);
    };
    loadConversation();
  }, [selectedLead?.id]);

  if (!selectedLead) {
    return (
      <section className="dashboard-main">
        <h1 style={{ textAlign: "center", color: "#8892b0", marginTop: "100px" }}>
          Select a lead from the list to view details
        </h1>
      </section>
    );
  }

  const tempClass = (lead: Lead) => {
    const score = Number(lead.score || 0);
    const temp = lead.lead_temperature || (score >= 70 ? "Hot" : score >= 40 ? "Warm" : "Cold");
    return `temp-badge ${temp.toLowerCase()}`;
  };

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleString();
  };

  return (
    <section className="dashboard-main">
      <header className="dashboard-header">
        <div>
          <h1>Lead Details</h1>
          <p>Manage and view lead information</p>
        </div>
        <div className="header-actions">
          <button className="glass-button"><Calendar size={17} /></button>
          <button className="primary-button"><Sparkles size={18} /> New Lead</button>
        </div>
      </header>

      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", marginBottom: "24px" }}>
          <div>
            <Panel title="Lead Information">
              <span className={`temp-badge ${tempClass(selectedLead)}`} style={{ position: "absolute", right: "16px", top: "16px" }}>
                {selectedLead && selectedLead.lead_temperature ? selectedLead.lead_temperature[0]?.toUpperCase() + selectedLead.lead_temperature.slice(1) || "Lead" : "Lead"} Lead
              </span>
              <div className="field"><span>Name</span><strong>{selectedLead.name || "-"}</strong></div>
              <div className="field"><span>Company</span><strong>{selectedLead.company || "-"}</strong></div>
              <div className="field"><span>Email</span><strong>{selectedLead.email || "-"}</strong></div>
              <div className="field"><span>Phone</span><strong>{selectedLead.phone || "-"}</strong></div>
              <div className="field"><span>Website</span><strong>{selectedLead.website || "-"}</strong></div>
              <div className="field"><span>Industry</span><strong>{selectedLead.industry || "-"}</strong></div>
              <div className="field">
                <span>Required Services</span>
                <strong className="tags">
                  {(selectedLead.services || []).map((service: string) => <i key={service}>{service}</i>)}
                </strong>
              </div>
              <div className="field"><span>Lead Score</span><strong>{selectedLead.score || 0}/100</strong></div>
              <div className="scorebar"><b style={{ width: `${Math.min(selectedLead.score || 0, 100)}%` }} /></div>
              <div className="field"><span>Temperature</span><strong><i className={`temp-dot ${selectedLead.lead_temperature?.toLowerCase() || "cold"}`} /> {selectedLead.lead_temperature || "Cold"}</strong></div>
              <div className="field"><span>Assigned To</span><strong>{selectedLead.assigned_to || "Unassigned"}</strong></div>
              <div className="followup">
                <Calendar size={17} /> Next Follow-up <strong>{formatDate(selectedLead.follow_up ?? undefined)}</strong>
              </div>
            </Panel>
          </div>

          <div>
            <Panel title="Conversation History">
              <div className="messages" style={{ height: "300px", overflow: "auto" }}>
                {messages.map((msg, idx) => (
                  <div key={idx} className={`bubble ${msg.role}`} style={{ maxWidth: "80%" }}>
                    <strong>{msg.role === "agent" ? "AI" : "Visitor"}:</strong> {msg.text}
                  </div>
                ))}
              </div>
              {messages.length === 0 && <p className="muted">No conversation history yet.</p>}
            </Panel>

            <Panel title="Activity">
              <div className="activity-list">
                {[{ type: "lead", description: "Lead created", name: selectedLead.name }, { type: "crawl", description: "Website crawled", name: selectedLead.website || "N/A" }].map((item, index) => (
                  <div key={index} style={{ borderBottom: "1px solid rgba(255,255,255,.1)", padding: "8px 0" }}>
                    <Star className="yellow" size={18} /><p><strong>{item.description}</strong><span>{item.name}</span></p>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </div>

        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <Panel title="Lead Notes & Tags">
            <div style={{ background: "rgba(255,255,255,.14)", borderRadius: 8, padding: 20, minHeight: 120 }}>
              <p style={{ color: "#8892b0", marginBottom: 12, fontSize: 12 }}>No notes yet. Add notes to track lead progress.</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <i>Follow-up needed</i>
                <i>Proposal sent</i>
                <i>Quote requested</i>
              </div>
            </div>
          </Panel>

          <Panel title="Integration Status">
            <div style={{ background: "rgba(255,255,255,.14)", borderRadius: 8, padding: 20, minHeight: 100 }}>
              <p style={{ color: "#8892b0", fontSize: 12, marginBottom: 8 }}>Integration Status:</p>
              <div style={{ display: "flex", gap: 24, marginBottom: 8 }}>
                <span style={{ color: "#57f287", fontWeight: 500 }}>Cal.com: Connected</span>
                <span style={{ color: "#ffad3d", fontWeight: 500 }}>Mailjet: Pending</span>
                <span style={{ color: "#7b61ff", fontWeight: 500 }}>Google Sheets: Synced</span>
              </div>
              <p style={{ color: "#666", fontSize: 11, marginTop: 4 }}>Never commit .env to version control.</p>
            </div>
          </Panel>
        </div>
      </div>
    </section>
  );
}

function Panel({ title, className = "", children }: { title?: string; className?: string; children: any }) {
  return <article className={`panel ${className}`}>{title && <h2>{title}</h2>}{children}</article>;
}

export default LeadDetailsPage;