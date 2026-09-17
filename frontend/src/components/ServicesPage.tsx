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
  X,
  Save,
  Trash2,
  Edit2,
  Plus,
} from "lucide-react";
import "./styles.css";

type Service = {
  id: string;
  name: string;
  description: string | null;
  status: "Active" | "Inactive";
  source_url: string | null;
  created_at: string | null;
  updated_at: string | null;
};

const apiUrl = (import.meta.env.VITE_API_URL ?? `${window.location.protocol}//${window.location.hostname}:8001`).replace(/\/$/, "");

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  // `init` used to be dropped, so every POST/PATCH/DELETE silently ran as a GET
  // and the request body was never sent.
  const response = await fetch(`${apiUrl}${path}`, init);
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.detail || `Request failed (HTTP ${response.status})`);
  }
  return (await response.json()) as T;
}

function ServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Service | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({ name: "", description: "", status: "Active" as "Active" | "Inactive", source_url: "" });
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson<Service[]>("/api/services");
      setServices(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load services");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function openAddModal() {
    setEditing(null);
    setFormData({ name: "", description: "", status: "Active", source_url: "" });
    setIsModalOpen(true);
  }

  function openEditModal(service: Service) {
    setEditing(service);
    setFormData({
      name: service.name,
      description: service.description || "",
      status: service.status,
      source_url: service.source_url || "",
    });
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
    setEditing(null);
    setFormData({ name: "", description: "", status: "Active", source_url: "" });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await fetchJson(`/api/services/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });
      } else {
        await fetchJson("/api/services", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });
      }
      closeModal();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save service");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(service: Service) {
    if (!window.confirm(`Delete "${service.name}"?`)) return;
    try {
      await fetchJson(`/api/services/${service.id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete service");
    }
  }

  return (
    <section className="dashboard-main">
      <header className="dashboard-header">
        <div>
          <h1>Services</h1>
          <p>Manage service offerings</p>
        </div>
        <div className="header-actions">
          <button className="glass-button" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={17} /> Refresh
          </button>
          <button className="primary-button" onClick={openAddModal} disabled={saving}>
            <Plus size={18} /> Add Service
          </button>
        </div>
      </header>

      {error && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <p style={{ color: "#ff506e", margin: 0 }}>{error}</p>
        </div>
      )}

      {loading && <p className="muted">Loading services…</p>}

      {!loading && !error && (
        <div style={{ padding: "12px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ color: "#fff", background: "rgba(255,255,255,0.05)", borderRadius: "16px", padding: "12px" }}>
                <th style={{ width: "20%", textAlign: "left", padding: "12px" }}>Service</th>
                <th style={{ width: "50%", textAlign: "left", padding: "12px" }}>Description</th>
                <th style={{ width: "15%", textAlign: "center", padding: "12px" }}>Status</th>
                <th style={{ width: "15%", textAlign: "center", padding: "12px" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {services.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ padding: "24px", textAlign: "center", color: "#8892b0" }}>
                    No services found. Click "Add Service" to create one.
                  </td>
                </tr>
              )}
              {services.map((service) => (
                <tr
                  key={service.id}
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    borderRadius: "16px",
                    margin: "8px 0",
                    transition: "background 0.2s ease",
                  }}
                >
                  <td style={{ padding: "12px" }}>{service.name}</td>
                  <td style={{ padding: "12px", color: "#8892b0", maxWidth: "400px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {service.description || "—"}
                  </td>
                  <td style={{ padding: "12px", textAlign: "center" }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "4px",
                        background: service.status === "Active" ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)",
                        borderRadius: "20px",
                        padding: "4px 12px",
                        color: service.status === "Active" ? "#22c55e" : "#ef4444",
                        fontWeight: "500",
                        fontSize: "12px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {service.status}
                    </span>
                  </td>
                  <td style={{ padding: "12px", textAlign: "center" }}>
                    <button
                      className="glass-button"
                      style={{ padding: "6px 10px", marginRight: "8px" }}
                      onClick={(e) => { e.stopPropagation(); openEditModal(service); }}
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      className="glass-button"
                      style={{ padding: "6px 10px", color: "#ff506e", borderColor: "rgba(255,80,108,0.3)" }}
                      onClick={(e) => { e.stopPropagation(); handleDelete(service); }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div
          className="modal-overlay"
          onClick={closeModal}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px",
          }}
        >
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#1e293b",
              border: "1px solid rgba(255,255,255,0.18)",
              borderRadius: "16px",
              padding: "24px",
              width: "100%",
              maxWidth: "500px",
              boxShadow: "0 24px 80px #00000059",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 style={{ margin: 0, color: "#fff" }}>{editing ? "Edit Service" : "Add Service"}</h2>
              <button onClick={closeModal} style={{ background: "none", border: "none", color: "#8892b0", cursor: "pointer", fontSize: "24px", lineHeight: 1 }}>
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", color: "#d7e4ff", fontSize: "13px", marginBottom: "6px" }}>Service Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Enter service name"
                  required
                  style={{
                    width: "100%",
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.18)",
                    borderRadius: "8px",
                    padding: "10px 12px",
                    color: "#fff",
                    fontSize: "14px",
                    boxSizing: "border-box",
                  }}
                />
              </div>
              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", color: "#d7e4ff", fontSize: "13px", marginBottom: "6px" }}>Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Enter description (optional)"
                  rows={3}
                  style={{
                    width: "100%",
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.18)",
                    borderRadius: "8px",
                    padding: "10px 12px",
                    color: "#fff",
                    fontSize: "14px",
                    fontFamily: "inherit",
                    boxSizing: "border-box",
                    resize: "vertical",
                  }}
                />
              </div>
              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", color: "#d7e4ff", fontSize: "13px", marginBottom: "6px" }}>Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as "Active" | "Inactive" })}
                  style={{
                    width: "100%",
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.18)",
                    borderRadius: "8px",
                    padding: "10px 12px",
                    color: "#fff",
                    fontSize: "14px",
                    appearance: "none",
                    boxSizing: "border-box",
                  }}
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", color: "#d7e4ff", fontSize: "13px", marginBottom: "6px" }}>Source URL (optional)</label>
                <input
                  type="url"
                  value={formData.source_url}
                  onChange={(e) => setFormData({ ...formData, source_url: e.target.value })}
                  placeholder="https://example.com/service"
                  style={{
                    width: "100%",
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.18)",
                    borderRadius: "8px",
                    padding: "10px 12px",
                    color: "#fff",
                    fontSize: "14px",
                    boxSizing: "border-box",
                  }}
                />
              </div>
              <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "8px" }}>
                <button type="button" className="glass-button" onClick={closeModal} disabled={saving}>
                  Cancel
                </button>
                <button type="submit" className="primary-button" disabled={saving || !formData.name.trim()}>
                  <Save size={16} /> {saving ? "Saving…" : (editing ? "Update" : "Create")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

export default ServicesPage;