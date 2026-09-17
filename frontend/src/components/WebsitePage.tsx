import { useEffect, useRef, useState, type ReactNode } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import "./styles.css";

type SiteSummary = {
  website_url: string | null;
  pages_crawled: number;
  coverage_by_page_type: Record<string, number>;
  kb_chunk_count: number;
  sitemap_available: boolean;
  last_crawled_at: string | null;
  crawl_settings: { max_pages: number; request_delay: number; timeout: number };
};

type CrawlJob = {
  job_id: string;
  status: "running" | "completed" | "failed";
  progress: number;
  pages_found: number;
  created_at: string | null;
  completed_at: string | null;
};

const apiUrl = (import.meta.env.VITE_API_URL ?? `${window.location.protocol}//${window.location.hostname}:8001`).replace(/\/$/, "");

function fmtDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : "—";
}

function duration(job: CrawlJob) {
  if (!job.created_at || !job.completed_at) return "—";
  const seconds = Math.round((new Date(job.completed_at).getTime() - new Date(job.created_at).getTime()) / 1000);
  if (seconds < 0) return "—";
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
}

const statusColor = (status: string) =>
  status === "completed" ? "#57f287" : status === "failed" ? "#ff506e" : "#ffad3d";

function WebsitePage() {
  const [summary, setSummary] = useState<SiteSummary | null>(null);
  const [jobs, setJobs] = useState<CrawlJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const pollRef = useRef<number | null>(null);

  async function load(showSpinner = true) {
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      const [summaryRes, jobsRes] = await Promise.all([
        fetch(`${apiUrl}/api/crawler/site-summary`),
        fetch(`${apiUrl}/api/crawler/jobs`),
      ]);
      if (!summaryRes.ok || !jobsRes.ok) throw new Error("Failed to load website data");
      setSummary((await summaryRes.json()) as SiteSummary);
      setJobs((await jobsRes.json()) as CrawlJob[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load website data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  // Poll while a crawl is running so stats update when it finishes
  useEffect(() => {
    const anyRunning = jobs.some((job) => job.status === "running");
    if (anyRunning && pollRef.current === null) {
      pollRef.current = window.setInterval(() => void load(false), 5000);
    }
    if (!anyRunning && pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
      void load(false);
    }
  }, [jobs]);

  useEffect(
    () => () => {
      if (pollRef.current !== null) window.clearInterval(pollRef.current);
    },
    []
  );

  async function startCrawl() {
    setStarting(true);
    setError(null);
    try {
      const response = await fetch(`${apiUrl}/api/crawler/start`, { method: "POST" });
      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        throw new Error(detail?.detail || `Failed to start crawl (HTTP ${response.status})`);
      }
      await load(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start crawl");
    } finally {
      setStarting(false);
    }
  }

  const running = jobs.some((job) => job.status === "running");
  const coverage = summary ? Object.entries(summary.coverage_by_page_type) : [];

  return (
    <section className="dashboard-main">
      <header className="dashboard-header">
        <div>
          <h1>Website</h1>
          <p>Configured website and its real crawl statistics</p>
        </div>
        <div className="header-actions">
          <button className="glass-button" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={17} /> Refresh
          </button>
          <button className="primary-button" onClick={() => void startCrawl()} disabled={starting || running}>
            <Sparkles size={18} /> {starting || running ? "Crawl Running…" : "Re-crawl Website"}
          </button>
        </div>
      </header>

      {loading && <p className="muted">Loading website data…</p>}

      {error && !loading && (
        <div className="panel">
          <p style={{ color: "#ff506e", margin: 0 }}>{error}</p>
          <button className="glass-button" style={{ marginTop: 12 }} onClick={() => void load()}>
            <RefreshCw size={16} /> Retry
          </button>
        </div>
      )}

      {!loading && !error && summary && (
        <>
          {!summary.website_url && (
            <div className="panel">
              <p className="muted" style={{ margin: 0 }}>
                No website configured. Set <code>TARGET_WEBSITE_URL</code> in the backend <code>.env</code> and restart the backend.
              </p>
            </div>
          )}

          {summary.website_url && (
            <div style={{ display: "grid", gap: 24, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
              <Panel title="Connected Website">
                <a href={summary.website_url} target="_blank" rel="noreferrer" style={{ color: "#72c9ff", fontSize: 16, wordBreak: "break-all" }}>
                  {summary.website_url}
                </a>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 20 }}>
                  <div style={{ textAlign: "center" }}>
                    <strong style={{ color: "#fff", fontSize: 24 }}>{summary.pages_crawled}</strong>
                    <div style={{ color: "#8892b0", fontSize: 12 }}>Pages Crawled</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <strong style={{ color: "#fff", fontSize: 24 }}>{summary.kb_chunk_count}</strong>
                    <div style={{ color: "#8892b0", fontSize: 12 }}>Knowledge Chunks</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <strong style={{ color: "#fff", fontSize: 24 }}>{Object.keys(summary.coverage_by_page_type).length}</strong>
                    <div style={{ color: "#8892b0", fontSize: 12 }}>Page Types</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <strong style={{ color: "#fff", fontSize: 24 }}>{summary.sitemap_available ? "Yes" : "No"}</strong>
                    <div style={{ color: "#8892b0", fontSize: 12 }}>Sitemap Generated</div>
                  </div>
                </div>
                <p style={{ color: "#8892b0", fontSize: 12, marginTop: 16 }}>Last crawl: {fmtDate(summary.last_crawled_at)}</p>
              </Panel>

              <Panel title="Coverage by Page Type">
                {coverage.length === 0 ? (
                  <p className="muted">No pages crawled yet. Run a crawl to see the content breakdown.</p>
                ) : (
                  <div className="service-list">
                    {coverage.map(([type, count]) => (
                      <div className="service-row" key={type}>
                        <span>{type}</span>
                        <div>
                          <b style={{ width: `${Math.min(100, (count / Math.max(1, summary.pages_crawled)) * 100)}%` }} />
                        </div>
                        <em>{count}</em>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </div>
          )}

          <Panel title={`Crawl History (${jobs.length})`}>
            {jobs.length === 0 ? (
              <p className="muted">No crawl jobs recorded yet. Use “Re-crawl Website” to run the first crawl.</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "#8892b0", fontSize: 12 }}>
                    <th style={{ padding: "8px 4px" }}>Started</th>
                    <th style={{ padding: "8px 4px" }}>Pages</th>
                    <th style={{ padding: "8px 4px" }}>Status</th>
                    <th style={{ padding: "8px 4px" }}>Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => (
                    <tr key={job.job_id} style={{ borderTop: "1px solid rgba(255,255,255,0.1)" }}>
                      <td style={{ padding: "10px 4px" }}>{fmtDate(job.created_at)}</td>
                      <td style={{ padding: "10px 4px" }}>{job.pages_found}</td>
                      <td style={{ padding: "10px 4px" }}>
                        <span style={{ color: statusColor(job.status), background: "rgba(255,255,255,0.08)", borderRadius: 20, padding: "3px 10px", fontSize: 12, textTransform: "capitalize" }}>
                          {job.status}
                        </span>
                      </td>
                      <td style={{ padding: "10px 4px" }}>{duration(job)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        </>
      )}
    </section>
  );
}

function Panel({ title, className = "", children }: { title?: string; className?: string; children: ReactNode }) {
  return <article className={`panel ${className}`}>{title && <h2>{title}</h2>}{children}</article>;
}

export default WebsitePage;
