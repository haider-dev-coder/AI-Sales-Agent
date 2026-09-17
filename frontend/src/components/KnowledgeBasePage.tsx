import { useCallback, useEffect, useState } from "react";
import { Download, Eye, RefreshCw, RotateCw, Search, Trash2 } from "lucide-react";
import {
  apiDelete,
  apiGet,
  apiGetSafe,
  apiPost,
  buildQuery,
  fmtDateTime,
} from "./apiClient";
import {
  Banner,
  EmptyState,
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

type Chunk = {
  id: number;
  url: string;
  page_type: string | null;
  page_title: string | null;
  chunk_index: number;
  chunk_text: string;
  status: string;
  crawled_at: string | null;
};

type KbStats = {
  chunk_count: number;
  page_count: number;
  type_count: number;
  last_crawled: string | null;
  coverage_by_page_type: Record<string, number>;
};

type UrlSummary = {
  url: string;
  chunk_count: number;
  last_crawled: string | null;
};

const EMPTY_STATS: KbStats = {
  chunk_count: 0,
  page_count: 0,
  type_count: 0,
  last_crawled: null,
  coverage_by_page_type: {},
};

const STATUS_COLORS: Record<string, string> = {
  indexed: "#34d399",
  stale: "#ffb443",
  failed: "#ff6b6b",
};

function statusColor(status: string): string {
  return STATUS_COLORS[status] ?? "#8892b0";
}

function KnowledgeBasePage() {
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<KbStats>(EMPTY_STATS);
  const [urls, setUrls] = useState<UrlSummary[]>([]);

  const [search, setSearch] = useState("");
  const [urlFilter, setUrlFilter] = useState("");
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Chunk | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = buildQuery({
        search,
        url: urlFilter || undefined,
        status: status || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      });
      const data = await apiGet<{ items: Chunk[]; total: number }>(`/api/kb/chunks${query}`);
      setChunks(data.items);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load knowledge base");
    } finally {
      setLoading(false);
    }
  }, [search, urlFilter, status, dateFrom, dateTo, page]);

  const loadStats = useCallback(async () => {
    const data = await apiGetSafe<KbStats>("/api/kb/stats", EMPTY_STATS);
    setStats(data);
  }, []);

  const loadUrls = useCallback(async () => {
    const data = await apiGetSafe<UrlSummary[]>("/api/kb/urls", []);
    setUrls(data);
  }, []);

  useEffect(() => {
    void loadStats();
    void loadUrls();
  }, [loadStats, loadUrls]);

  useEffect(() => {
    void load();
  }, [load]);

  function refresh() {
    void load();
    void loadStats();
    void loadUrls();
  }

  async function deleteChunk(chunk: Chunk) {
    if (!window.confirm(`Delete chunk #${chunk.chunk_index} from ${chunk.url}?`)) return;
    try {
      await apiDelete(`/api/kb/chunks/${chunk.id}`);
      if (viewing?.id === chunk.id) setViewing(null);
      void load();
      void loadStats();
      void loadUrls();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete chunk");
    }
  }

  async function recrawl(url: string) {
    setBusy(url);
    setMessage(null);
    setError(null);
    try {
      await apiPost(`/api/kb/recrawl${buildQuery({ url })}`);
      setMessage(`Re-crawled ${url} and refreshed its chunks.`);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to re-crawl URL");
    } finally {
      setBusy(null);
    }
  }

  async function reindex() {
    setBusy("__reindex__");
    setMessage(null);
    setError(null);
    try {
      const result = await apiPost<{ indexed: number; skipped: number }>("/api/kb/reindex");
      setMessage(`Re-indexed ${result.indexed} chunks for the AI agent (${result.skipped} skipped).`);
      void loadStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to re-index");
    } finally {
      setBusy(null);
    }
  }

  const coverage = Object.entries(stats.coverage_by_page_type);

  return (
    <section className="dashboard-main">
      <header className="dashboard-header">
        <div>
          <h1>Knowledge Base</h1>
          <p>Real crawled content chunks that power the AI agent's grounded answers.</p>
        </div>
        <div className="header-actions">
          <button className="glass-button" onClick={reindex} disabled={busy === "__reindex__"}>
            <RotateCw size={16} /> {busy === "__reindex__" ? "Re-indexing…" : "Re-index"}
          </button>
          <button className="glass-button" onClick={refresh}>
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
      </header>

      <div className="kpi-row">
        <StatCard label="Chunks Indexed" value={stats.chunk_count} accent="#7b61ff" />
        <StatCard label="Source Pages" value={stats.page_count} accent="#60a5fa" />
        <StatCard label="Page Types" value={stats.type_count} accent="#34d399" />
        <StatCard label="Last Crawled" value={stats.last_crawled ? fmtDateTime(stats.last_crawled).split(",")[0] : "—"} accent="#ffb443" />
      </div>

      {message && <Banner>{message}</Banner>}
      {error && <Banner tone="warn">{error}</Banner>}

      {coverage.length > 0 && (
        <Panel title="Coverage by Page Type">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {coverage.map(([type, count]) => (
              <div
                key={type}
                style={{
                  background: "rgba(123,97,255,0.12)",
                  border: "1px solid rgba(123,97,255,0.3)",
                  borderRadius: 12,
                  padding: "10px 16px",
                  minWidth: 120,
                }}
              >
                <div style={{ color: "#b7a6ff", fontSize: 12, textTransform: "capitalize" }}>{type}</div>
                <div style={{ color: "#fff", fontSize: 20, fontWeight: 700 }}>{count}</div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <Toolbar
        left={
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, position: "relative" }}>
              <Search size={15} style={{ position: "absolute", left: 10, color: "#8892b0" }} />
              <input
                style={{ ...inputStyle, paddingLeft: 32, width: 260 }}
                placeholder="Search chunk text or page title..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
            </div>
            <select
              style={{ ...selectStyle, width: 240 }}
              value={urlFilter}
              onChange={(e) => { setUrlFilter(e.target.value); setPage(1); }}
            >
              <option value="">All URLs</option>
              {urls.map((u) => (
                <option key={u.url} value={u.url}>{u.url}</option>
              ))}
            </select>
            <select
              style={{ ...selectStyle, width: 150 }}
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            >
              <option value="">All Status</option>
              <option value="indexed">Indexed</option>
              <option value="stale">Stale</option>
              <option value="failed">Failed</option>
            </select>
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
          </>
        }
        right={<span style={{ fontSize: 12, color: "#8892b0" }}>{loading ? "Loading…" : `${total} chunk${total === 1 ? "" : "s"}`}</span>}
      />

      <Panel title="Crawled Chunks">
        <TableShell>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStyle}>#</th>
                <th style={thStyle}>Page / Content</th>
                <th style={thStyle}>Type</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Crawled</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {chunks.map((chunk) => (
                <tr key={chunk.id}>
                  <td style={{ ...tdStyle, color: "#8892b0" }}>{chunk.chunk_index}</td>
                  <td style={tdStyle}>
                    <div style={{ color: "#fff", fontSize: 13, fontWeight: 500 }}>
                      {chunk.page_title || chunk.url}
                    </div>
                    <div style={{ color: "#8892b0", fontSize: 12, maxWidth: 420, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {chunk.chunk_text}
                    </div>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ color: "#b7a6ff", fontSize: 12, textTransform: "capitalize" }}>
                      {chunk.page_type || "—"}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <StatusPill label={chunk.status} color={statusColor(chunk.status)} />
                  </td>
                  <td style={tdStyle}>{fmtDateTime(chunk.crawled_at)}</td>
                  <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap" }}>
                    <button
                      className="glass-button"
                      style={{ padding: "5px 10px", marginRight: 6 }}
                      onClick={() => setViewing(chunk)}
                      title="View content"
                    >
                      <Eye size={14} />
                    </button>
                    <button
                      className="glass-button"
                      style={{ padding: "5px 10px", marginRight: 6 }}
                      onClick={() => recrawl(chunk.url)}
                      disabled={busy === chunk.url}
                      title="Re-crawl this URL"
                    >
                      <RotateCw size={14} />
                    </button>
                    <button
                      className="glass-button"
                      style={{ padding: "5px 10px", color: "#ff6b6b" }}
                      onClick={() => deleteChunk(chunk)}
                      title="Delete chunk"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && chunks.length === 0 && (
            <EmptyState message="No chunks match your filters. Crawl a site or adjust the filters above." />
          )}
        </TableShell>
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} />
      </Panel>

      <Panel title="Source URLs">
        {urls.length > 0 ? (
          <TableShell>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thStyle}>URL</th>
                  <th style={thStyle}>Chunks</th>
                  <th style={thStyle}>Last Crawled</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {urls.map((u) => (
                  <tr key={u.url}>
                    <td style={{ ...tdStyle, color: "#cdd7ee", maxWidth: 480, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {u.url}
                    </td>
                    <td style={tdStyle}>{u.chunk_count}</td>
                    <td style={tdStyle}>{fmtDateTime(u.last_crawled)}</td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>
                      <button
                        className="glass-button"
                        style={{ padding: "5px 10px" }}
                        onClick={() => recrawl(u.url)}
                        disabled={busy === u.url}
                      >
                        <RotateCw size={14} style={{ verticalAlign: "-2px", marginRight: 4 }} />
                        {busy === u.url ? "Crawling…" : "Re-crawl"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>
        ) : (
          <EmptyState message="No source URLs indexed yet." />
        )}
      </Panel>

      {viewing && (
        <Modal title={`Chunk #${viewing.chunk_index} — ${viewing.page_title || viewing.url}`} onClose={() => setViewing(null)} width={680}>
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12, color: "#8892b0" }}>
              <span>Type: <strong style={{ color: "#b7a6ff", textTransform: "capitalize" }}>{viewing.page_type || "—"}</strong></span>
              <span>Status: <strong style={{ color: statusColor(viewing.status) }}>{viewing.status}</strong></span>
              <span>Crawled: <strong style={{ color: "#cdd7ee" }}>{fmtDateTime(viewing.crawled_at)}</strong></span>
            </div>
            <a href={viewing.url} target="_blank" rel="noreferrer" style={{ color: "#7b61ff", fontSize: 13, overflowWrap: "anywhere" }}>
              {viewing.url}
            </a>
            <div
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 12,
                padding: 14,
                color: "#d7e4ff",
                fontSize: 13,
                lineHeight: 1.7,
                whiteSpace: "pre-wrap",
                maxHeight: "50vh",
                overflowY: "auto",
              }}
            >
              {viewing.chunk_text}
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className="glass-button" onClick={() => recrawl(viewing.url)} disabled={busy === viewing.url}>
                <RotateCw size={14} style={{ verticalAlign: "-2px", marginRight: 4 }} /> Re-crawl
              </button>
              <button
                className="glass-button"
                style={{ color: "#ff6b6b" }}
                onClick={() => deleteChunk(viewing)}
              >
                <Trash2 size={14} style={{ verticalAlign: "-2px", marginRight: 4 }} /> Delete
              </button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}

export default KnowledgeBasePage;
