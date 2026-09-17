import { useEffect, useRef, useState, type ReactNode } from "react";
import { RefreshCw, Sparkles, Workflow } from "lucide-react";
import "./styles.css";

type CrawlJob = {
  job_id: string;
  website_url?: string | null;
  status: "running" | "completed" | "failed";
  progress: number;
  pages_found: number;
  errors: unknown[];
  created_at: string | null;
  completed_at: string | null;
};

type SitemapEntry = {
  url: string;
  title: string | null;
  type: string;
  parent: string | null;
  depth: number;
};

type SiteSummary = {
  website_url: string | null;
  pages_crawled: number;
  coverage_by_page_type: Record<string, number>;
  kb_chunk_count: number;
  sitemap_available: boolean;
  last_crawled_at: string | null;
  crawl_settings: { max_pages: number; request_delay: number; timeout: number };
};

const apiUrl = (import.meta.env.VITE_API_URL ?? `${window.location.protocol}//${window.location.hostname}:8001`).replace(/\/$/, "");

async function getJson<T>(path: string): Promise<T> {
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

const statusColor = (status: string) =>
  status === "completed" ? "#57f287" : status === "failed" ? "#ff506e" : "#ffad3d";

function CrawlManagement() {
  const [jobs, setJobs] = useState<CrawlJob[]>([]);
  const [sitemap, setSitemap] = useState<SitemapEntry[]>([]);
  const [summary, setSummary] = useState<SiteSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sitemapMessage, setSitemapMessage] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const pollRef = useRef<number | null>(null);

  async function load(showSpinner = true) {
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      const [jobsData, summaryData] = await Promise.all([
        getJson<CrawlJob[]>("/api/crawler/jobs"),
        getJson<SiteSummary>("/api/crawler/site-summary"),
      ]);
      setJobs(jobsData);
      setSummary(summaryData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load crawler data");
    }
    try {
      const sitemapData = await getJson<SitemapEntry[]>("/api/crawler/sitemap");
      setSitemap(Array.isArray(sitemapData) ? sitemapData : []);
      setSitemapMessage(null);
    } catch (err) {
      setSitemap([]);
      setSitemapMessage(err instanceof Error ? err.message : "No sitemap available yet.");
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  // Poll while any job is running so progress updates in real time
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
    return () => {};
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

  const totalPages = jobs.reduce((sum, job) => sum + (job.pages_found || 0), 0);
  const runningJobs = jobs.filter((job) => job.status === "running").length;
  const failedJobs = jobs.filter((job) => job.status === "failed").length;
  const jobsWithErrors = jobs.filter((job) => job.errors && job.errors.length > 0);

  return (
    <section className="dashboard-main">
      <header className="dashboard-header">
        <div>
          <h1>Crawler Management</h1>
          <p>
            Real crawl jobs for {summary?.website_url ? <a href={summary.website_url} target="_blank" rel="noreferrer" style={{ color: "#72c9ff" }}>{summary.website_url}</a> : "the configured website"}
          </p>
        </div>
        <div className="header-actions">
          <button className="glass-button" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={17} /> Refresh
          </button>
          <button className="primary-button" onClick={() => void startCrawl()} disabled={starting || runningJobs > 0}>
            <Sparkles size={18} /> {starting || runningJobs > 0 ? "Crawl Running…" : "Start Crawl"}
          </button>
        </div>
      </header>

      <section className="kpi-row">
        {[
          ["Total Jobs", jobs.length],
          ["Running", runningJobs],
          ["Pages Found", totalPages || summary?.pages_crawled || 0],
          ["Failed", failedJobs],
        ].map(([label, value]) => (
          <article className="kpi-card" key={label as string}>
            <Workflow size={27} />
            <p>{label}</p>
            <strong>{value as number}</strong>
          </article>
        ))}
      </section>

      {loading && <p className="muted">Loading crawler data…</p>}
      {error && (
        <div className="panel">
          <p style={{ color: "#ff506e", margin: 0 }}>{error}</p>
          <button className="glass-button" style={{ marginTop: 12 }} onClick={() => void load()}>
            <RefreshCw size={16} /> Retry
          </button>
        </div>
      )}

      {!loading && !error && (
        <>
          <section className="middle-grid">
            <Panel title={`Crawl Jobs (${jobs.length})`}>
              {jobs.length === 0 && (
                <div className="muted" style={{ padding: "12px 0" }}>
                  <p>No crawl jobs have run yet.</p>
                  <p style={{ fontSize: 12 }}>Click “Start Crawl” to crawl {summary?.website_url || "the configured website"}.</p>
                </div>
              )}
              {jobs.map((job) => (
                <div key={job.job_id} style={{ borderBottom: "1px solid rgba(255,255,255,.1)", padding: "12px 0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                    <strong style={{ wordBreak: "break-all" }}>Job {job.job_id.slice(0, 8)}</strong>
                    <span
                      style={{
                        background: "rgba(255,255,255,0.1)",
                        borderRadius: 20,
                        padding: "4px 10px",
                        color: statusColor(job.status),
                        fontSize: 12,
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {job.status.toUpperCase()}
                    </span>
                  </div>
                  <div style={{ color: "#d7e4ff", fontSize: 12, marginTop: 6 }}>
                    {job.pages_found} pages · started {fmtDate(job.created_at)}
                    {job.completed_at ? ` · finished ${fmtDate(job.completed_at)}` : ""}
                  </div>
                  <div style={{ height: 8, background: "rgba(255,255,255,.14)", borderRadius: 4, marginTop: 8 }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${job.progress}%`,
                        background: job.status === "failed" ? "#ff506e" : job.status === "completed" ? "#57f287" : "#ffad3d",
                        borderRadius: 4,
                        transition: "width 0.3s",
                      }}
                    />
                  </div>
                </div>
              ))}
            </Panel>

            <Panel title={`Sitemap URLs (${sitemap.length})`}>
              {sitemap.length === 0 && (
                <div className="muted" style={{ padding: "12px 0" }}>
                  <p>{sitemapMessage || "No sitemap URLs found."}</p>
                  <p style={{ fontSize: 12 }}>Run a crawl to generate the sitemap.</p>
                </div>
              )}
              <div style={{ maxHeight: 420, overflow: "auto" }}>
                {sitemap.map((entry) => (
                  <div key={entry.url} style={{ borderBottom: "1px solid rgba(255,255,255,.1)", padding: "6px 0" }}>
                    <a href={entry.url} target="_blank" rel="noreferrer" style={{ color: "#fff", fontSize: 13, wordBreak: "break-all" }}>
                      {entry.title || entry.url}
                    </a>
                    <div style={{ color: "#8892b0", fontSize: 11 }}>{entry.url} · {entry.type}</div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Crawl Settings (from server configuration)">
              {summary ? (
                <div style={{ display: "grid", gap: 10 }}>
                  <div><span className="muted">Target website</span><br /><strong>{summary.website_url || "Not configured"}</strong></div>
                  <div><span className="muted">Max pages</span><br /><strong>{summary.crawl_settings.max_pages}</strong></div>
                  <div><span className="muted">Request delay</span><br /><strong>{summary.crawl_settings.request_delay}s</strong></div>
                  <div><span className="muted">Timeout</span><br /><strong>{summary.crawl_settings.timeout}s</strong></div>
                  <div><span className="muted">Last crawl</span><br /><strong>{fmtDate(summary.last_crawled_at)}</strong></div>
                </div>
              ) : (
                <p className="muted">No configuration loaded.</p>
              )}
            </Panel>
          </section>

          <section className="bottom-grid">
            <Panel title={`Error Log (${jobsWithErrors.reduce((sum, job) => sum + job.errors.length, 0)})`}>
              {jobsWithErrors.length === 0 && <p className="muted">No crawl errors recorded.</p>}
              {jobsWithErrors.map((job) =>
                job.errors.map((err, index) => (
                  <div key={`${job.job_id}-${index}`} style={{ borderBottom: "1px solid rgba(255,255,255,.1)", padding: "6px 0", fontSize: 13 }}>
                    <strong>Job {job.job_id.slice(0, 8)}:</strong>{" "}
                    <span className="muted">{typeof err === "string" ? err : JSON.stringify(err)}</span>
                  </div>
                ))
              )}
            </Panel>
            <Panel title="Coverage by Page Type">
              {!summary || Object.keys(summary.coverage_by_page_type).length === 0 ? (
                <p className="muted">No crawled pages yet. Run a crawl to see coverage.</p>
              ) : (
                <div className="service-list">
                  {Object.entries(summary.coverage_by_page_type).map(([type, count]) => (
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
          </section>
        </>
      )}
    </section>
  );
}

function Panel({ title, className = "", children }: { title?: string; className?: string; children: ReactNode }) {
  return <article className={`panel ${className}`}>{title && <h2>{title}</h2>}{children}</article>;
}

export default CrawlManagement;
