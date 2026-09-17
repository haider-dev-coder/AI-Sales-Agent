import { useCallback, useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { apiDelete, apiGet, apiGetSafe, apiPatch, apiPost, buildQuery, fmtDateTime } from "./apiClient";
import {
  Banner,
  EmptyState,
  Field,
  Modal,
  Pagination,
  Panel,
  StatCard,
  StatusPill,
  TableShell,
  Toolbar,
  inputStyle,
  selectStyle,
  tdStyle,
  thStyle,
} from "./ui";
import "./styles.css";

const PAGE_SIZE = 10;

type FollowUp = {
  id: string;
  lead_id: string;
  rep_id: string | null;
  scheduled_at: string;
  status: string;
  notes: string | null;
  created_at: string;
  lead_name: string | null;
  lead_company: string | null;
  rep_name: string | null;
};

type FollowUpStats = {
  total: number;
  pending: number;
  done: number;
  overdue: number;
};

type Lead = {
  id: string;
  full_name: string;
  company_name: string | null;
  email: string | null;
};

const EMPTY_STATS: FollowUpStats = { total: 0, pending: 0, done: 0, overdue: 0 };

function FollowUpsPage() {
  const [items, setItems] = useState<FollowUp[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<FollowUpStats>(EMPTY_STATS);
  const [leads, setLeads] = useState<Lead[]>([]);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = buildQuery({
        search: search || undefined,
        status: status || undefined,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      });
      const data = await apiGet<{ items: FollowUp[]; total: number }>(`/api/follow-ups${query}`);
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load follow-ups");
    } finally {
      setLoading(false);
    }
  }, [search, status, page]);

  const loadStats = useCallback(async () => {
    const data = await apiGetSafe<FollowUpStats>("/api/follow-ups/stats", EMPTY_STATS);
    setStats(data);
  }, []);

  const loadLeads = useCallback(async () => {
    const data = await apiGetSafe<Lead[]>("/api/leads", []);
    setLeads(data);
  }, []);

  useEffect(() => {
    void loadStats();
    void loadLeads();
  }, [loadStats, loadLeads]);

  useEffect(() => {
    void load();
  }, [load]);

  function refresh() {
    void load();
    void loadStats();
  }

  async function markDone(fu: FollowUp) {
    try {
      await apiPatch(`/api/follow-ups/${fu.id}/done`);
      void load();
      void loadStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark follow-up done");
    }
  }

  async function remove(fu: FollowUp) {
    if (!window.confirm("Delete this follow-up?")) return;
    try {
      await apiDelete(`/api/follow-ups/${fu.id}`);
      void load();
      void loadStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete follow-up");
    }
  }

  function isOverdue(fu: FollowUp): boolean {
    return fu.status === "pending" && new Date(fu.scheduled_at).getTime() < Date.now();
  }

  function statusOf(fu: FollowUp): { label: string; color: string } {
    if (fu.status === "done") return { label: "Done", color: "#34d399" };
    if (isOverdue(fu)) return { label: "Overdue", color: "#ff6b6b" };
    return { label: "Pending", color: "#ffb443" };
  }

  return (
    <section className="dashboard-main">
      <header className="dashboard-header">
        <div>
          <h1>Follow-ups</h1>
          <p>Track scheduled follow-ups for leads — pending, done, and overdue.</p>
        </div>
        <div className="header-actions">
          <button className="glass-button" onClick={refresh}>
            <RefreshCw size={16} /> Refresh
          </button>
          <button className="primary-button" onClick={() => setShowAdd(true)}>
            <Plus size={16} /> Add Follow-up
          </button>
        </div>
      </header>

      <div className="kpi-row">
        <StatCard label="Total Follow-ups" value={stats.total} accent="#7b61ff" />
        <StatCard label="Pending" value={stats.pending} accent="#ffb443" />
        <StatCard label="Done" value={stats.done} accent="#34d399" />
        <StatCard label="Overdue" value={stats.overdue} accent="#ff6b6b" />
      </div>

      {error && <Banner tone="warn">{error}</Banner>}

      <Toolbar
        left={
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, position: "relative" }}>
              <Search size={15} style={{ position: "absolute", left: 10, color: "#8892b0" }} />
              <input
                style={{ ...inputStyle, paddingLeft: 32, width: 260 }}
                placeholder="Search lead, company, or notes..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
            </div>
            <select
              style={{ ...selectStyle, width: 160 }}
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            >
              <option value="">All Status</option>
              <option value="pending">Pending</option>
              <option value="done">Done</option>
              <option value="overdue">Overdue</option>
            </select>
          </>
        }
        right={<span style={{ fontSize: 12, color: "#8892b0" }}>{loading ? "Loading…" : `${total} follow-up${total === 1 ? "" : "s"}`}</span>}
      />

      <Panel title="Follow-up List">
        <TableShell>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStyle}>Lead</th>
                <th style={thStyle}>Company</th>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Notes</th>
                <th style={thStyle}>Rep</th>
                <th style={thStyle}>Status</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((fu) => {
                const statusInfo = statusOf(fu);
                return (
                  <tr key={fu.id}>
                    <td style={{ ...tdStyle, color: "#fff", fontWeight: 500 }}>
                      {fu.lead_name || "—"}
                    </td>
                    <td style={tdStyle}>{fu.lead_company || "—"}</td>
                    <td style={tdStyle}>{fmtDateTime(fu.scheduled_at)}</td>
                    <td style={tdStyle}>
                      <span style={{ color: "#8892b0", maxWidth: 300, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {fu.notes || "—"}
                      </span>
                    </td>
                    <td style={tdStyle}>{fu.rep_name || "Unassigned"}</td>
                    <td style={tdStyle}>
                      <StatusPill label={statusInfo.label} color={statusInfo.color} />
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap" }}>
                      {fu.status !== "done" && (
                        <button
                          className="glass-button"
                          style={{ padding: "5px 10px", marginRight: 6, color: "#34d399" }}
                          onClick={() => markDone(fu)}
                          title="Mark as done"
                        >
                          <CheckCircle2 size={14} style={{ verticalAlign: "-2px", marginRight: 4 }} /> Done
                        </button>
                      )}
                      <button
                        className="glass-button"
                        style={{ padding: "5px 10px", color: "#ff6b6b" }}
                        onClick={() => remove(fu)}
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!loading && items.length === 0 && (
            <EmptyState message="No follow-ups found. Adjust the filters or add a follow-up to get started." />
          )}
        </TableShell>
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} />
      </Panel>

      {showAdd && (
        <AddFollowUpModal
          leads={leads}
          onSave={async (payload) => {
            await apiPost<FollowUp>("/api/follow-ups", payload);
            setShowAdd(false);
            setPage(1);
            void load();
            void loadStats();
          }}
          onClose={() => setShowAdd(false)}
        />
      )}
    </section>
  );
}

function AddFollowUpModal({
  leads,
  onSave,
  onClose,
}: {
  leads: Lead[];
  onSave: (payload: { lead_id: string; scheduled_at: string; notes?: string; status?: string }) => Promise<void>;
  onClose: () => void;
}) {
  const [leadId, setLeadId] = useState(leads[0]?.id ?? "");
  const [scheduledAt, setScheduledAt] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function defaultDate(): string {
    const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }

  useEffect(() => {
    if (!scheduledAt) setScheduledAt(defaultDate());
  }, [scheduledAt]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!leadId) {
      setFormError("Select a lead.");
      return;
    }
    if (!scheduledAt) {
      setFormError("Pick a date and time.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const payload: { lead_id: string; scheduled_at: string; notes?: string; status?: string } = {
        lead_id: leadId,
        scheduled_at: new Date(scheduledAt).toISOString(),
      };
      if (notes.trim()) payload.notes = notes.trim();
      await onSave(payload);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to add follow-up");
      setSaving(false);
    }
  }

  return (
    <Modal title="Add Follow-up" onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
        <Field label="Lead *">
          <select style={selectStyle} value={leadId} onChange={(e) => setLeadId(e.target.value)}>
            {leads.length === 0 && <option value="">No leads available</option>}
            {leads.map((lead) => (
              <option key={lead.id} value={lead.id}>
                {lead.full_name}{lead.company_name ? ` — ${lead.company_name}` : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date & Time *">
          <input
            type="datetime-local"
            style={inputStyle}
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
          />
        </Field>
        <Field label="Notes">
          <textarea
            style={{ ...inputStyle, minHeight: 80, resize: "vertical" }}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What should the rep cover in this follow-up?"
          />
        </Field>
        {formError && <div style={{ color: "#ff6b6b", fontSize: 13 }}>{formError}</div>}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" className="glass-button" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary-button" disabled={saving}>
            {saving ? "Saving…" : "Add Follow-up"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default FollowUpsPage;
