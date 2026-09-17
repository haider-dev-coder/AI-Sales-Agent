import { useEffect, useState, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import "./styles.css";

type SitemapEntry = {
  url: string;
  title: string | null;
  type: string;
  parent: string | null;
  depth: number;
  summary?: string | null;
};

type SitemapNode = SitemapEntry & { children: SitemapNode[] };

const apiUrl = (import.meta.env.VITE_API_URL ?? `${window.location.protocol}//${window.location.hostname}:8001`).replace(/\/$/, "");

function buildTree(entries: SitemapEntry[]): SitemapNode[] {
  // A URL can appear more than once in the payload; dedupe first so each node is
  // attached exactly once (otherwise the same node yields duplicate React keys).
  const unique = new Map<string, SitemapEntry>();
  for (const entry of entries) if (!unique.has(entry.url)) unique.set(entry.url, entry);
  const list = [...unique.values()];
  const nodes = new Map<string, SitemapNode>();
  const roots: SitemapNode[] = [];
  for (const entry of list) nodes.set(entry.url, { ...entry, children: [] });
  for (const entry of list) {
    const node = nodes.get(entry.url)!;
    const parent = entry.parent ? nodes.get(entry.parent) : undefined;
    if (parent && parent !== node) parent.children.push(node);
    else roots.push(node);
  }
  const byDepth = (a: SitemapNode, b: SitemapNode) => a.depth - b.depth || a.url.localeCompare(b.url);
  roots.sort(byDepth);
  nodes.forEach((node) => node.children.sort(byDepth));
  return roots;
}

function SitemapPage() {
  const [entries, setEntries] = useState<SitemapEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${apiUrl}/api/crawler/sitemap`);
      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        throw new Error(detail?.detail || `Failed to load sitemap (HTTP ${response.status})`);
      }
      const data = await response.json();
      setEntries(Array.isArray(data) ? data : []);
    } catch (err) {
      setEntries([]);
      setError(err instanceof Error ? err.message : "Failed to load sitemap");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const tree = buildTree(entries);
  const typeCounts = entries.reduce<Record<string, number>>((acc, entry) => {
    const key = entry.type || "other";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const maxDepth = entries.reduce((max, entry) => Math.max(max, entry.depth || 0), 0);

  const typeColors = ["#57f287", "#7b61ff", "#ffad3d", "#5ab7ff", "#ff506e", "#ffcd4f"];

  const renderNode = (node: SitemapNode) => (
    <div key={node.url} style={{ marginLeft: node.depth > 0 ? 18 : 0, borderLeft: node.depth > 0 ? "1px solid rgba(255,255,255,.12)" : "none", paddingLeft: node.depth > 0 ? 10 : 0 }}>
      <div style={{ padding: "6px 0" }}>
        <a href={node.url} target="_blank" rel="noreferrer" style={{ color: "#fff", fontSize: 13, wordBreak: "break-all" }}>
          {node.title || node.url}
        </a>
        <div style={{ color: "#8892b0", fontSize: 11 }}>
          {node.url} · {node.type} · depth {node.depth}
        </div>
      </div>
      {node.children.map(renderNode)}
    </div>
  );

  return (
    <section className="dashboard-main">
      <header className="dashboard-header">
        <div>
          <h1>Sitemap</h1>
          <p>Real website structure from the latest crawl</p>
        </div>
        <div className="header-actions">
          <button className="glass-button" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={17} /> Refresh
          </button>
          <a className="primary-button" href={`${apiUrl}/api/crawler/sitemap.xml`} download="sitemap.xml">
            Export XML
          </a>
        </div>
      </header>

      {loading && <p className="muted">Loading sitemap…</p>}

      {error && !loading && (
        <div className="panel">
          <p className="muted" style={{ marginTop: 0 }}>No sitemap data available.</p>
          <p style={{ color: "#ffad91", fontSize: 13 }}>{error}</p>
          <button className="glass-button" style={{ marginTop: 12 }} onClick={() => void load()}>
            <RefreshCw size={16} /> Retry
          </button>
        </div>
      )}

      {!loading && !error && entries.length === 0 && (
        <div className="panel">
          <p className="muted">The sitemap is empty. Run a crawl from the Crawls page to generate it.</p>
        </div>
      )}

      {!loading && !error && entries.length > 0 && (
        <div style={{ display: "grid", gap: 24, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
          <Panel title="Sitemap Statistics">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
              <div style={{ textAlign: "center" }}>
                <strong style={{ color: "#fff", fontSize: 24 }}>{entries.length}</strong>
                <div style={{ color: "#8892b0", fontSize: 12 }}>Total Pages</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <strong style={{ color: "#fff", fontSize: 24 }}>{Object.keys(typeCounts).length}</strong>
                <div style={{ color: "#8892b0", fontSize: 12 }}>Page Types</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <strong style={{ color: "#fff", fontSize: 24 }}>{maxDepth}</strong>
                <div style={{ color: "#8892b0", fontSize: 12 }}>Max Depth</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <strong style={{ color: "#fff", fontSize: 24 }}>{tree.length}</strong>
                <div style={{ color: "#8892b0", fontSize: 12 }}>Root Pages</div>
              </div>
            </div>
            <div style={{ marginTop: 20 }}>
              {Object.entries(typeCounts).map(([type, count], index) => (
                <div key={type} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, fontSize: 13 }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: typeColors[index % typeColors.length] }} />
                  <span style={{ color: "#fff" }}>{type}</span>
                  <span style={{ marginLeft: "auto", color: "#8892b0" }}>{count}</span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title={`Sitemap Structure (${entries.length} URLs)`}>
            <div style={{ maxHeight: 560, overflow: "auto" }}>{tree.map(renderNode)}</div>
          </Panel>
        </div>
      )}
    </section>
  );
}

function Panel({ title, className = "", children }: { title?: string; className?: string; children: ReactNode }) {
  return <article className={`panel ${className}`}>{title && <h2>{title}</h2>}{children}</article>;
}

export default SitemapPage;
