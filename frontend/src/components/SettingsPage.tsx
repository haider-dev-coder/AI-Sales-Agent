import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { apiDelete, apiGet, apiGetSafe, apiPatch, apiPost, apiPut } from "./apiClient";
import {
  Banner,
  EmptyState,
  Field,
  Modal,
  Panel,
  StatusPill,
  TableShell,
  inputStyle,
  selectStyle,
  tdStyle,
  thStyle,
} from "./ui";
import "./styles.css";

type SettingsData = Record<string, Record<string, string | number>>;

type SalesRep = {
  id: string;
  name: string;
  email: string;
  status: string;
  created_at: string;
};

type FieldType = "text" | "password" | "number" | "textarea" | "select";

type FieldDef = {
  key: string;
  label: string;
  type?: FieldType;
  placeholder?: string;
  options?: string[];
  step?: number;
  help?: string;
};

type TabDef = {
  id: string;
  label: string;
  section?: string;
  fields?: FieldDef[];
};

const TABS: TabDef[] = [
  {
    id: "general",
    label: "General",
    section: "general",
    fields: [
      { key: "site_name", label: "Site Name", type: "text", placeholder: "AI Sales Agent" },
      { key: "timezone", label: "Timezone", type: "select", options: ["UTC", "Asia/Karachi", "America/New_York", "Europe/London", "Asia/Dubai"] },
      { key: "language", label: "Language", type: "select", options: ["English", "Urdu", "Arabic", "Spanish", "French"] },
    ],
  },
  {
    id: "ai_agent",
    label: "AI Agent",
    section: "ai_agent",
    fields: [
      { key: "gemini_api_key", label: "Gemini API Key", type: "password", placeholder: "Enter API key", help: "Stored securely and never shown in full again." },
      { key: "model", label: "Model", type: "select", options: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash", "gemini-1.5-pro"] },
      { key: "temperature", label: "Temperature", type: "number", step: 0.1 },
      { key: "rag_top_k", label: "RAG Top K", type: "number" },
      { key: "similarity_threshold", label: "Similarity Threshold", type: "number", step: 0.01 },
      { key: "system_prompt", label: "System Prompt", type: "textarea", placeholder: "Instructions that shape the agent's behaviour." },
    ],
  },
  {
    id: "integrations",
    label: "Integrations",
    section: "integrations",
    fields: [
      { key: "calcom_api_key", label: "Cal.com API Key", type: "password" },
      { key: "calcom_event_type", label: "Cal.com Event Type ID", type: "text" },
      { key: "mailjet_api_key", label: "Mailjet API Key", type: "password" },
      { key: "mailjet_secret", label: "Mailjet Secret", type: "password" },
      { key: "google_sheets_credentials", label: "Google Sheets Credentials (JSON)", type: "textarea" },
      { key: "supabase_url", label: "Supabase URL", type: "text" },
      { key: "supabase_key", label: "Supabase Key", type: "password" },
    ],
  },
  {
    id: "notifications",
    label: "Notifications",
    section: "notifications",
    fields: [
      { key: "new_lead_alert", label: "New Lead Alert", type: "select", options: ["Email", "SMS", "Both", "Off"] },
      { key: "meeting_booked", label: "Meeting Booked", type: "select", options: ["Email", "SMS", "Both", "Off"] },
      { key: "follow_up_reminder", label: "Follow-up Reminder", type: "select", options: ["Email", "SMS", "Both", "Off"] },
    ],
  },
  { id: "team", label: "Team & Permissions" },
  {
    id: "advanced",
    label: "Advanced",
    section: "advanced",
    fields: [
      { key: "crawler_max_pages", label: "Crawler Max Pages", type: "number" },
      { key: "crawl_delay", label: "Crawl Delay (s)", type: "number", step: 0.1 },
      { key: "crawl_timeout", label: "Crawl Timeout (s)", type: "number" },
      { key: "cache_ttl", label: "Cache TTL (s)", type: "number" },
    ],
  },
];

function SettingsPage() {
  const [activeTab, setActiveTab] = useState(TABS[0].id);
  const [settings, setSettings] = useState<SettingsData>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<SettingsData>("/api/settings");
      setSettings(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function update(section: string, key: string, value: string) {
    setSettings((prev) => ({
      ...prev,
      [section]: { ...(prev[section] ?? {}), [key]: value },
    }));
  }

  async function saveSection(tab: TabDef) {
    if (!tab.section || !tab.fields) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const sectionValues: Record<string, string | number> = {};
      tab.fields.forEach((field) => {
        const raw = settings[tab.section as string]?.[field.key];
        if (raw === undefined) return;
        sectionValues[field.key] = field.type === "number" ? Number(raw) : raw;
      });
      await apiPut<{ saved: number }>("/api/settings", { [tab.section]: sectionValues });
      setMessage(`${tab.label} settings saved.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  const tab = TABS.find((t) => t.id === activeTab) as TabDef;

  return (
    <section className="dashboard-main">
      <header className="dashboard-header">
        <div>
          <h1>Settings</h1>
          <p>Configure the AI agent, integrations, notifications, team access and advanced options.</p>
        </div>
        <div className="header-actions">
          <button className="glass-button" onClick={load} disabled={loading}>
            <RefreshCw size={16} /> Refresh
          </button>
          {tab.section && (
            <button className="primary-button" onClick={() => saveSection(tab)} disabled={saving}>
              <Save size={16} /> {saving ? "Saving…" : "Save Changes"}
            </button>
          )}
        </div>
      </header>

      {message && <Banner>{message}</Banner>}
      {error && <Banner tone="warn">{error}</Banner>}

      <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div
          style={{
            minWidth: 210,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 16,
            padding: 12,
          }}
        >
          <nav style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {TABS.map((t) => (
              <button
                key={t.id}
                className="glass-button"
                onClick={() => { setActiveTab(t.id); setMessage(null); setError(null); }}
                style={{
                  justifyContent: "flex-start",
                  textAlign: "left",
                  padding: "10px 14px",
                  background: activeTab === t.id ? "rgba(123,97,255,0.28)" : undefined,
                  borderColor: activeTab === t.id ? "rgba(123,97,255,0.6)" : undefined,
                }}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>

        <div style={{ flex: 1, minWidth: 320 }}>
          {loading ? (
            <Panel>
              <EmptyState message="Loading settings…" />
            </Panel>
          ) : tab.id === "team" ? (
            <TeamTab />
          ) : (
            <Panel title={tab.label}>
              <div style={{ display: "grid", gap: 16, maxWidth: 620 }}>
                {(tab.fields ?? []).map((field) => {
                  const value = settings[tab.section as string]?.[field.key] ?? "";
                  return (
                    <Field key={field.key} label={field.label}>
                      {field.type === "textarea" ? (
                        <textarea
                          style={{ ...inputStyle, minHeight: 90, resize: "vertical" }}
                          value={String(value)}
                          placeholder={field.placeholder}
                          onChange={(e) => update(tab.section as string, field.key, e.target.value)}
                        />
                      ) : field.type === "select" ? (
                        <select
                          style={selectStyle}
                          value={String(value)}
                          onChange={(e) => update(tab.section as string, field.key, e.target.value)}
                        >
                          {(field.options ?? []).map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type={field.type === "password" ? "password" : field.type === "number" ? "number" : "text"}
                          step={field.step}
                          style={inputStyle}
                          value={String(value)}
                          placeholder={field.placeholder}
                          onChange={(e) => update(tab.section as string, field.key, e.target.value)}
                        />
                      )}
                      {field.help && (
                        <span style={{ color: "#8892b0", fontSize: 12 }}>{field.help}</span>
                      )}
                    </Field>
                  );
                })}
                <div>
                  <button className="primary-button" onClick={() => saveSection(tab)} disabled={saving}>
                    <Save size={16} /> {saving ? "Saving…" : "Save Changes"}
                  </button>
                </div>
              </div>
            </Panel>
          )}
        </div>
      </div>
    </section>
  );
}

function TeamTab() {
  const [reps, setReps] = useState<SalesRep[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<SalesRep | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await apiGetSafe<SalesRep[]>("/api/sales-reps", []);
    setReps(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveRep(payload: { name: string; email: string; status: string }, id?: string) {
    if (id) {
      const updated = await apiPatch<SalesRep>(`/api/sales-reps/${id}`, payload);
      setReps((prev) => prev.map((r) => (r.id === id ? updated : r)));
    } else {
      await apiPost<SalesRep>("/api/sales-reps", payload);
      void load();
    }
  }

  async function removeRep(rep: SalesRep) {
    if (!window.confirm(`Remove ${rep.name} from the team?`)) return;
    try {
      await apiDelete(`/api/sales-reps/${rep.id}`);
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove team member");
    }
  }

  async function toggleStatus(rep: SalesRep) {
    const nextStatus = rep.status === "active" ? "inactive" : "active";
    try {
      const updated = await apiPatch<SalesRep>(`/api/sales-reps/${rep.id}`, {
        name: rep.name,
        email: rep.email,
        status: nextStatus,
      });
      setReps((prev) => prev.map((r) => (r.id === rep.id ? updated : r)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status");
    }
  }

  return (
    <Panel title="Team & Permissions">
      {error && <Banner tone="warn">{error}</Banner>}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button className="primary-button" onClick={() => { setEditing(null); setShowForm(true); }}>
          <Plus size={16} /> Add Member
        </button>
      </div>
      <TableShell>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Email</th>
              <th style={thStyle}>Role</th>
              <th style={thStyle}>Status</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {reps.map((rep) => (
              <tr key={rep.id}>
                <td style={{ ...tdStyle, color: "#fff", fontWeight: 500 }}>{rep.name}</td>
                <td style={tdStyle}>{rep.email}</td>
                <td style={tdStyle}>
                  <span style={{ color: "#b7a6ff", fontSize: 12 }}>Sales Rep</span>
                </td>
                <td style={tdStyle}>
                  <StatusPill label={rep.status} color={rep.status === "active" ? "#34d399" : "#8892b0"} />
                </td>
                <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap" }}>
                  <button className="glass-button" style={{ padding: "5px 10px", marginRight: 6 }} onClick={() => { setEditing(rep); setShowForm(true); }}>
                    Edit
                  </button>
                  <button className="glass-button" style={{ padding: "5px 10px", marginRight: 6 }} onClick={() => toggleStatus(rep)}>
                    {rep.status === "active" ? "Deactivate" : "Activate"}
                  </button>
                  <button className="glass-button" style={{ padding: "5px 10px", color: "#ff6b6b" }} onClick={() => removeRep(rep)}>
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && reps.length === 0 && (
          <EmptyState message="No team members yet. Add your first sales rep to start assigning leads." />
        )}
      </TableShell>

      {showForm && (
        <RepFormModal
          rep={editing}
          onSave={saveRep}
          onClose={() => setShowForm(false)}
        />
      )}
    </Panel>
  );
}

function RepFormModal({
  rep,
  onSave,
  onClose,
}: {
  rep: SalesRep | null;
  onSave: (payload: { name: string; email: string; status: string }, id?: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(rep?.name ?? "");
  const [email, setEmail] = useState(rep?.email ?? "");
  const [status, setStatus] = useState(rep?.status ?? "active");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      setFormError("Name and email are required.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await onSave({ name: name.trim(), email: email.trim(), status }, rep?.id);
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save member");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={rep ? "Edit Team Member" : "Add Team Member"} onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
        <Field label="Name *">
          <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
        </Field>
        <Field label="Email *">
          <input type="email" style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
        </Field>
        <Field label="Status">
          <select style={selectStyle} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </Field>
        {formError && <div style={{ color: "#ff6b6b", fontSize: 13 }}>{formError}</div>}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" className="glass-button" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary-button" disabled={saving}>
            {saving ? "Saving…" : rep ? "Save Changes" : "Add Member"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default SettingsPage;
