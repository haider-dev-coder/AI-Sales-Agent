import type { ReactNode } from "react";
import "./styles.css";

export function Panel({
  title,
  className = "",
  children,
}: {
  title?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <article className={`panel ${className}`}>
      {title && <h2>{title}</h2>}
      {children}
    </article>
  );
}

export function Modal({
  title,
  onClose,
  children,
  width = 520,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(4, 8, 32, 0.65)",
        backdropFilter: "blur(3px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        padding: "20px",
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: width,
          maxHeight: "88vh",
          overflowY: "auto",
          background: "linear-gradient(180deg, #1b2450, #161d3d)",
          border: "1px solid rgba(255,255,255,0.16)",
          borderRadius: "16px",
          boxShadow: "0 24px 80px rgba(4,8,32,0.6)",
          padding: "20px",
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "14px",
          }}
        >
          <h3 style={{ margin: 0, fontSize: "16px" }}>{title}</h3>
          <button
            className="glass-button"
            onClick={onClose}
            style={{ padding: "4px 10px", lineHeight: 1 }}
            aria-label="Close"
          >
            ×
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: "grid", gap: "6px", fontSize: "13px" }}>
      <span style={{ color: "#d7e4ff", fontWeight: 500 }}>{label}</span>
      {children}
    </label>
  );
}

export const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: "10px",
  padding: "9px 12px",
  color: "#fff",
  fontSize: "14px",
};

export const selectStyle: React.CSSProperties = {
  ...inputStyle,
  appearance: "none",
  cursor: "pointer",
};

export function StatusPill({ label, color }: { label: string; color: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        background: "rgba(255,255,255,0.08)",
        borderRadius: "20px",
        padding: "3px 10px",
        color,
        fontWeight: 500,
        fontSize: "12px",
        whiteSpace: "nowrap",
      }}
    >
      <i style={{ width: 7, height: 7, borderRadius: "50%", background: color }} />
      {label}
    </span>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <p style={{ color: "#8892b0", fontSize: "14px", padding: "18px 4px", textAlign: "center" }}>
      {message}
    </p>
  );
}

export function Toolbar({
  left,
  right,
}: {
  left?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "10px",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: "14px",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center" }}>{left}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center" }}>{right}</div>
    </div>
  );
}

export function StatCard({
  label,
  value,
  accent = "#7b61ff",
}: {
  label: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <article className="kpi-card">
      <p>{label}</p>
      <strong style={{ color: accent }}>{value}</strong>
    </article>
  );
}

export const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  fontSize: "12px",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "#b9d7ff",
  borderBottom: "1px solid rgba(255,255,255,0.12)",
  whiteSpace: "nowrap",
};

export const tdStyle: React.CSSProperties = {
  padding: "11px 12px",
  fontSize: "13px",
  borderBottom: "1px solid rgba(255,255,255,0.06)",
  verticalAlign: "top",
};

export function TableShell({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: "14px",
        overflowX: "auto",
        background: "rgba(255,255,255,0.03)",
      }}
    >
      {children}
    </div>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: "10px",
        marginTop: "12px",
        fontSize: "12px",
        color: "#8892b0",
      }}
    >
      <button
        className="glass-button"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
        style={{ opacity: page <= 1 ? 0.45 : 1, padding: "5px 12px" }}
      >
        Prev
      </button>
      <span>
        Page {page} of {totalPages} · {total} total
      </span>
      <button
        className="glass-button"
        disabled={page >= totalPages}
        onClick={() => onPage(page + 1)}
        style={{ opacity: page >= totalPages ? 0.45 : 1, padding: "5px 12px" }}
      >
        Next
      </button>
    </div>
  );
}

export function Banner({
  children,
  tone = "info",
  onAction,
  actionLabel,
}: {
  children: ReactNode;
  tone?: "info" | "warn";
  onAction?: () => void;
  actionLabel?: string;
}) {
  const color = tone === "warn" ? "#ffb443" : "#7b61ff";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        justifyContent: "space-between",
        flexWrap: "wrap",
        background: tone === "warn" ? "rgba(255,180,67,0.1)" : "rgba(123,97,255,0.12)",
        border: `1px solid ${color}55`,
        borderRadius: "12px",
        padding: "12px 16px",
        marginBottom: "14px",
        fontSize: "13px",
      }}
    >
      <div>{children}</div>
      {onAction && actionLabel && (
        <button className="glass-button" onClick={onAction} style={{ padding: "6px 14px" }}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
