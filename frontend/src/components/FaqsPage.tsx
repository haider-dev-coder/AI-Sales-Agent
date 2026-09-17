import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Download, Plus, RefreshCw, Search, Sparkles } from "lucide-react";
import {
  apiDelete,
  apiGet,
  apiGetSafe,
  apiPatch,
  apiPost,
  apiUrl,
  buildQuery,
  fmtDateTime,
} from "./apiClient";
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
const THRESHOLD = 3;

type FaqItem = {
  id: string;
  question: string;
  answer: string | null;
  category: string;
  is_active: boolean;
  frequency: number;
  last_asked: string | null;
  created_at: string;
};

type FaqStats = {
  total: number;
  active: number;
  inactive: number;
  auto_surfaced: number;
  total_asks: number;
};

type DetectedQuestion = {
  question: string;
  count: number;
  already_tracked: boolean;
};

type FaqPayload = {
  question: string;
  answer?: string;
  category?: string;
  is_active?: boolean;
};

const EMPTY_STATS: FaqStats = { total: 0, active: 0, inactive: 0, auto_surfaced: 0, total_asks: 0 };

function FaqsPage() {
  const [items, setItems] = useState<FaqItem[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<FaqStats>(EMPTY_STATS);
  const [categories, setCategories] = useState<string[]>([]);
  const [detected, setDetected] = useState<DetectedQuestion[]>([]);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<FaqItem | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = buildQuery({
        search,
        category,
        status,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      });
      const data = await apiGet<{ items: FaqItem[]; total: number }>(`/api/faqs${query}`);
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load FAQs");
    } finally {
      setLoading(false);
    }
  }, [search, category, status, dateFrom, dateTo, page]);

  const loadStats = useCallback(async () => {
    const data = await apiGetSafe<FaqStats>("/api/faqs/stats", EMPTY_STATS);
    setStats(data);
  }, []);

  const loadCategories = useCallback(async () => {
    const data = await apiGetSafe<string[]>("/api/faqs/categories", []);
    setCategories(data);
  }, []);

  const loadDetected = useCallback(async () => {
    const data = await apiGetSafe<DetectedQuestion[]>("/api/faqs/detect", []);
    setDetected(data.filter((d) => !d.already_tracked));
  }, []);

  useEffect(() => {
    void loadStats();
    void loadCategories();
    void loadDetected();
  }, [loadStats, loadCategories, loadDetected]);

  useEffect(() => {
    void load();
  }, [load]);

  function refresh() {
    void load();
    void loadStats();
    void loadDetected();
  }

  function exportCsv() {
    const query = buildQuery({
      search,
      category,
      status,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
    });
    window.open(`${apiUrl}/api/faqs/export${query}`, "_blank");
  }

  async function toggleFaq(faq: FaqItem) {
    try {
      const updated = await apiPatch<FaqItem>(`/api/faqs/${faq.id}/toggle`);
      setItems((prev) => prev.map((f) => (f.id === faq.id ? updated : f)));
      if (viewing?.id === faq.id) setViewing(updated);
      void loadStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to toggle FAQ");
    }
  }

  async function removeFaq(faq: FaqItem) {
    if (!window.confirm(`Delete FAQ "${faq.question}"?`)) return;
    try {
      await apiDelete(`/api/faqs/${faq.id}`);
      if (viewing?.id === faq.id) setViewing(null);
      void load();
      void loadStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete FAQ");
    }
  }

  async function saveFaq(payload: FaqPayload, id?: string) {
    if (id) {
      const updated = await apiPatch<FaqItem>(`/api/faqs/${id}`, payload);
      setItems((prev) => prev.map((f) => (f.id === id ? updated : f)));
      if (viewing?.id === id) setViewing(updated);
    } else {
      await apiPost<FaqItem>("/api/faqs", payload);
      setPage(1);
      void load();
    }
    void loadStats();
    void loadCategories();
    void loadDetected();
  }

  async function trackDetected(d: DetectedQuestion) {
    try {
      await apiPost<FaqItem>("/api/faqs", {
        question: d.question,
        category: "General",
        is_active: true,
        frequency: d.count,
      });
      setDetected((prev) => prev.filter((x) => x.question !== d.question));
      setPage(1);
      void load();
      void loadStats();
      void loadCategories();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to track question");
    }
  }

  return (
    <section className="dashboard-main">
      <header className="dashboard-header">
        <div>
          <h1>FAQs</h1>
          <p>Manage frequently asked questions, monitor ask rates, and surface questions asked 3+ times.</p>
        </div>
        <div className="header-actions">
          <input
            type="date"
            style={{ ...inputStyle, width: 150 }}
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            title="From date"
          />
          <input
            type="date"
            style={{ ...inputStyle, width: 150 }}
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            title="To date"
          />
          <button className="glass-button" onClick={refresh} title="Refresh">
            <RefreshCw size={16} /> Refresh
          </button>
          <button className="glass-button" onClick={exportCsv} title="Export as CSV">
            <Download size={16} /> Export CSV
          </button>
          <button className="primary-button" onClick={() => setShowAdd(true)}>
            <Plus size={16} /> New FAQ
          </button>
        </div>
      </header>

      <div className="kpi-row">
        <StatCard label="Total FAQs" value={stats.total} accent="#7b61ff" />
        <StatCard label="Active" value={stats.active} accent="#34d399" />
        <StatCard label="Inactive" value={stats.inactive} accent="#8892b0" />
        <StatCard label="Auto-Surfaced (3+ asks)" value={stats.auto_surfaced} accent="#ffb443" />
        <StatCard label="Total Ask Count" value={stats.total_asks} accent="#60a5fa" />
      </div>

      {error && <Banner tone="warn">{error}</Banner>}

      {detected.length > 0 && (
        <Banner tone="warn">
          <Sparkles size={15} style={{ verticalAlign: "-2px", marginRight: 6 }} />
          {detected.length} new question{detected.length > 1 ? "s" : ""} asked {THRESHOLD}+ times detected in real conversations.
        </Banner>
      )}

      <Toolbar
        left={
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, position: "relative" }}>
              <Search size={15} style={{ position: "absolute", left: 10, color: "#8892b0" }} />
              <input
                style={{ ...inputStyle, paddingLeft: 32, width: 260 }}
                placeholder="Search questions or answers..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
            </div>
            <select
              style={{ ...selectStyle, width: 180 }}
              value={category}
              onChange={(e) => { setCategory(e.target.value); setPage(1); }}
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select
              style={{ ...selectStyle, width: 160 }}
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            >
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="auto">Auto-Surfaced (3+)</option>
            </select>
          </>
        }
        right={<span style={{ fontSize: 12, color: "#8892b0" }}>{loading ? "Loading…" : `${total} FAQ${total === 1 ? "" : "s"}`}</span>}
      />

      <Panel title="FAQ List">
        <TableShell>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStyle}>Question</th>
                <th style={thStyle}>Category</th>
                <th style={thStyle}>Asks</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Last Asked</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((faq) => (
                <tr key={faq.id}>
                  <td style={tdStyle}>
                    <strong style={{ color: "#fff", fontSize: 13 }}>{faq.question}</strong>
                    <div style={{ color: "#8892b0", fontSize: 12, maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>
                      {faq.answer || "—"}
                    </div>
                  </td>
                  <td style={tdStyle}>
                    <span
                      style={{
                        background: "rgba(123,97,255,0.14)",
                        color: "#b7a6ff",
                        borderRadius: 20,
                        padding: "3px 10px",
                        fontSize: 12,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {faq.category || "General"}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontWeight: 600, color: faq.frequency >= THRESHOLD ? "#ffb443" : "#fff" }}>
                      {faq.frequency}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <StatusPill label={faq.is_active ? "Active" : "Inactive"} color={faq.is_active ? "#34d399" : "#8892b0"} />
                  </td>
                  <td style={tdStyle}>{fmtDateTime(faq.last_asked)}</td>
                  <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap" }}>
                    <button className="glass-button" style={{ padding: "5px 10px", marginRight: 6 }} onClick={() => setViewing(faq)}>
                      View
                    </button>
                    <button className="glass-button" style={{ padding: "5px 10px", marginRight: 6 }} onClick={() => setViewing(faq)}>
                      Edit
                    </button>
                    <button
                      className="glass-button"
                      style={{ padding: "5px 10px", marginRight: 6 }}
                      onClick={() => toggleFaq(faq)}
                      title={faq.is_active ? "Deactivate" : "Activate"}
                    >
                      {faq.is_active ? "Deactivate" : "Activate"}
                    </button>
                    <button
                      className="glass-button"
                      style={{ padding: "5px 10px", color: "#ff6b6b" }}
                      onClick={() => removeFaq(faq)}
                      title="Delete"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && items.length === 0 && (
            <EmptyState message="No FAQs found. Adjust filters or create a new FAQ — questions asked 3+ times appear here automatically." />
          )}
        </TableShell>
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} />
      </Panel>

      <Panel title="Auto-Surface — Questions Asked 3+ Times">
        {detected.length > 0 ? (
          <div style={{ display: "grid", gap: 10 }}>
            {detected.map((d) => (
              <div
                key={d.question}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                  background: "rgba(255,180,67,0.08)",
                  border: "1px solid rgba(255,180,67,0.25)",
                  borderRadius: 12,
                  padding: "10px 14px",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: "#fff", fontSize: 13, fontWeight: 500, overflowWrap: "anywhere" }}>{d.question}</div>
                  <div style={{ color: "#ffb443", fontSize: 12, marginTop: 2 }}>Asked {d.count} times in conversations</div>
                </div>
                <button className="glass-button" style={{ padding: "6px 12px", whiteSpace: "nowrap" }} onClick={() => trackDetected(d)}>
                  <Plus size={14} style={{ verticalAlign: "-2px", marginRight: 4 }} /> Track as FAQ
                </button>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState message="No new high-frequency questions detected yet. Questions asked 3+ times in real conversations appear here for one-click tracking." />
        )}
      </Panel>

      {viewing && (
        <FaqModal
          faq={viewing}
          categories={categories}
          onSave={saveFaq}
          onClose={() => setViewing(null)}
        />
      )}
      {showAdd && (
        <FaqModal
          faq={null}
          categories={categories}
          onSave={saveFaq}
          onClose={() => setShowAdd(false)}
        />
      )}
    </section>
  );
}

function FaqModal({
  faq,
  categories,
  onSave,
  onClose,
}: {
  faq: FaqItem | null;
  categories: string[];
  onSave: (payload: FaqPayload, id?: string) => Promise<void>;
  onClose: () => void;
}) {
  const isNew = faq === null;
  const [edit, setEdit] = useState(isNew);
  const [question, setQuestion] = useState(faq?.question ?? "");
  const [answer, setAnswer] = useState(faq?.answer ?? "");
  const [category, setCategory] = useState(faq?.category ?? "General");
  const [isActive, setIsActive] = useState(faq?.is_active ?? true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!question.trim()) {
      setFormError("Question is required.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const payload: FaqPayload = {
        question: question.trim(),
        category: category.trim() || "General",
        is_active: isActive,
      };
      if (answer.trim()) payload.answer = answer.trim();
      await onSave(payload, faq?.id);
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save FAQ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={isNew ? "New FAQ" : edit ? "Edit FAQ" : "FAQ Details"} onClose={onClose} width={560}>
      {!edit && faq ? (
        <div style={{ display: "grid", gap: 14 }}>
          <Field label="Question">
            <div style={{ color: "#fff", fontSize: 14 }}>{faq.question}</div>
          </Field>
          <Field label="Answer">
            <div style={{ color: "#cdd7ee", fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
              {faq.answer || "No answer provided."}
            </div>
          </Field>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", fontSize: 12, color: "#8892b0" }}>
            <span>Category: <strong style={{ color: "#b7a6ff" }}>{faq.category || "General"}</strong></span>
            <span>Ask count: <strong style={{ color: "#ffb443" }}>{faq.frequency}</strong></span>
            <span>Status: <strong style={{ color: faq.is_active ? "#34d399" : "#8892b0" }}>{faq.is_active ? "Active" : "Inactive"}</strong></span>
            <span>Last asked: <strong style={{ color: "#cdd7ee" }}>{fmtDateTime(faq.last_asked)}</strong></span>
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 6 }}>
            <button className="glass-button" onClick={onClose}>Close</button>
            <button className="primary-button" onClick={() => setEdit(true)}>Edit</button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
          <Field label="Question *">
            <textarea
              style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="What do customers ask?"
            />
          </Field>
          <Field label="Answer">
            <textarea
              style={{ ...inputStyle, minHeight: 110, resize: "vertical" }}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Authoritative answer surfaced by the AI agent."
            />
          </Field>
          <Field label="Category">
            <input
              style={inputStyle}
              value={category}
              list="faq-category-options"
              onChange={(e) => setCategory(e.target.value)}
              placeholder="General"
            />
            <datalist id="faq-category-options">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#d7e4ff" }}>
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Active (shown to the AI agent)
          </label>
          {formError && <div style={{ color: "#ff6b6b", fontSize: 13 }}>{formError}</div>}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
            <button type="button" className="glass-button" onClick={onClose}>Cancel</button>
            <button type="submit" className="primary-button" disabled={saving}>
              {saving ? "Saving…" : isNew ? "Create FAQ" : "Save Changes"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

export default FaqsPage;
