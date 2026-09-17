import { useState } from "react";
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

function Panel({ title, className = "", children }: { title?: string; className?: string; children: any }) {
  return <article className={`panel ${className}`}>{title && <h2>{title}</h2>}{children}</article>;
}

type IntegrationStatus = {
  calcom: boolean;
  mailjet: boolean;
  sheets: boolean;
  supabase: boolean;
};

function IntegrationSettings() {
  const [status, setStatus] = useState<IntegrationStatus>({ calcom: false, mailjet: false, sheets: false, supabase: false });

  return (
    <section className="dashboard-main">
      <header className="dashboard-header">
        <div>
          <h1>Integration Settings</h1>
          <p>Manage external service connections</p>
        </div>
        <div className="header-actions">
          <button className="glass-button"><Settings size={17} /></button>
        </div>
      </header>

      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        <section className="middle-grid">
          <Panel title="Cal.com Scheduling">
            <div style={{ background: "rgba(255,255,255,.14)", borderRadius: 8, padding: 20, minHeight: 180 }}>
              <div style={{ marginBottom: 16 }}>
                <strong>Status:</strong> {status.calcom ? "Connected" : "Not configured"}
              </div>
              <div style={{ marginTop: 16 }}>
                {status.calcom ? (
                  <div>
                    <p style={{ color: "#57f287", marginBottom: 8 }}>Account: sales-team@yourcompany.com</p>
                    <p style={{ color: "#8892b0", fontSize: 12, marginBottom: 4 }}>Connected since: January 15, 2024</p>
                    <button className="details-button" style={{ marginTop: 8 }}>View Bookings</button>
                  </div>
                ) : (
                  <p style={{ color: "#ff5c7a", marginBottom: 8 }}>
                    Cal.com API key not set. Add CALCOM_API_KEY to .env to enable scheduling.
                  </p>
                )}
              </div>
            </div>
          </Panel>

          <Panel title="Mailjet Email">
            <div style={{ background: "rgba(255,255,255,.14)", borderRadius: 8, padding: 20, minHeight: 180 }}>
              <div style={{ marginBottom: 16 }}>
                <strong>Status:</strong> {status.mailjet ? "Connected" : "Not configured"}
              </div>
              <div style={{ marginTop: 16 }}>
                {status.mailjet ? (
                  <div>
                    <p style={{ color: "#57f287", marginBottom: 8 }}>Sender: sales@yourcompany.com</p>
                    <p style={{ color: "#8892b0", fontSize: 12, marginBottom: 4 }}>Last email sent: January 10, 2024</p>
                    <button className="details-button" style={{ marginTop: 8 }}>View Template</button>
                  </div>
                ) : (
                  <p style={{ color: "#ff5c7a", marginBottom: 8 }}>
                    Mailjet API key not set. Add MAILJET_API_KEY and MAILJET_SECRET_KEY to .env to enable emails.
                  </p>
                )}
              </div>
            </div>
          </Panel>

          <Panel title="Google Sheets">
            <div style={{ background: "rgba(255,255,255,.14)", borderRadius: 8, padding: 20, minHeight: 180 }}>
              <div style={{ marginBottom: 16 }}>
                <strong>Status:</strong> {status.sheets ? "Connected" : "Not configured"}
              </div>
              <div style={{ marginTop: 16 }}>
                {status.sheets ? (
                  <div>
                    <p style={{ color: "#57f287", marginBottom: 8 }}>Sheet: Leads Export</p>
                    <p style={{ color: "#8892b0", fontSize: 12, marginBottom: 4 }}>Last synced: January 12, 2024</p>
                    <button className="details-button" style={{ marginTop: 8 }}>Manage Columns</button>
                  </div>
                ) : (
                  <p style={{ color: "#ff5c7a", marginBottom: 8 }}>
                    Google service account not set. Add GOOGLE_SERVICE_ACCOUNT_JSON and GOOGLE_SHEET_ID to .env to enable sync.
                  </p>
                )}
              </div>
            </div>
          </Panel>

          <Panel title="Supabase">
            <div style={{ background: "rgba(255,255,255,.14)", borderRadius: 8, padding: 20, minHeight: 180 }}>
              <div style={{ marginBottom: 16 }}>
                <strong>Status:</strong> {status.supabase ? "Connected" : "Not configured"}
              </div>
              <div style={{ marginTop: 16 }}>
                {status.supabase ? (
                  <div>
                    <p style={{ color: "#57f287", marginBottom: 8 }}>Project: ai-sales-agent</p>
                    <p style={{ color: "#8892b0", fontSize: 12, marginBottom: 4 }}>Last migration: January 18, 2024</p>
                  </div>
                ) : (
                  <p style={{ color: "#ff5c7a", marginBottom: 8 }}>
                    Supabase not configured. Add SUPABASE_URL and SUPABASE_KEY to .env to enable.
                  </p>
                )}
              </div>
            </div>
          </Panel>
        </section>

        <section className="bottom-grid">
          <Panel title="Webhook Events">
            <div style={{ background: "rgba(255,255,255,.14)", borderRadius: 8, padding: 20, minHeight: 160 }}>
              <p style={{ color: "#8892b0", fontSize: 12, marginBottom: 8 }}>Configure which events trigger webhooks:</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 4, color: "#fff" }}>
                  <input type="checkbox" checked disabled /> New leads
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 4, color: "#fff" }}>
                  <input type="checkbox" checked disabled /> Meeting bookings
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 4, color: "#fff" }}>
                  <input type="checkbox" checked disabled /> Form submissions
                </label>
              </div>
              <p style={{ color: "#8892b0", fontSize: 12, marginTop: 8 }}>Webhook URL: <strong style={{ color: "#00d4ff" }}>https://yourdomain.com/webhooks</strong></p>
            </div>
          </Panel>

          <Panel title="API Keys">
            <div style={{ background: "rgba(255,255,255,.14)", borderRadius: 8, padding: 20, minHeight: 160 }}>
              <p style={{ color: "#8892b0", fontSize: 12, marginBottom: 8 }}>Add credentials to .env file:</p>
              <div style={{ display: "grid", gap: 8, marginBottom: 8 }}>
                <div style={{ color: "#fff" }}>CALCOM_API_KEY</div>
                <div style={{ color: "#fff" }}>MAILJET_API_KEY</div>
                <div style={{ color: "#fff" }}>MAILJET_SECRET_KEY</div>
                <div style={{ color: "#fff" }}>GOOGLE_SERVICE_ACCOUNT_JSON</div>
                <div style={{ color: "#fff" }}>GOOGLE_SHEET_ID</div>
                <div style={{ color: "#fff" }}>SUPABASE_URL</div>
                <div style={{ color: "#fff" }}>SUPABASE_KEY</div>
              </div>
              <p style={{ color: "#666", fontSize: 11, marginTop: 8 }}>
                <strong>Never commit .env to version control.</strong>
              </p>
            </div>
          </Panel>
        </section>
      </div>
    </section>
  );
}

export default IntegrationSettings;