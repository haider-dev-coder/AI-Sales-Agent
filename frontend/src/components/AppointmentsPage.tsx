import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Clock, Plus, RefreshCw, Users, Video, X } from "lucide-react";
import { AppointmentRow } from "./AppointmentRow";
import {
  browserTimeZone,
  cancelBooking,
  createBooking,
  durationMinutes,
  fetchBookings,
  fmtDateTime,
  isCancelled,
  relativeStartLabel,
  rescheduleBooking,
  statusColor,
  statusLabel,
  tabForBooking,
  toIsoFromLocalInput,
  toLocalInputValue,
  type Booking,
  type BookingTab,
} from "./calcom";
import "./styles.css";

type ViewMode = "list" | "new" | "reschedule";

const TABS: BookingTab[] = ["Upcoming", "Completed", "Cancelled"];

function AppointmentsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [selectedTab, setSelectedTab] = useState<BookingTab>("Upcoming");
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [newBooking, setNewBooking] = useState({ name: "", email: "", start_time: "", notes: "" });
  const [rescheduleTime, setRescheduleTime] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchBookings();
      setBookings(list);
    } catch (err) {
      setBookings([]);
      setError(err instanceof Error ? err.message : "Failed to load Cal.com bookings");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  // Split bookings into the three tabs and sort them sensibly.
  const byTab = useMemo(() => {
    const grouped: Record<BookingTab, Booking[]> = { Upcoming: [], Completed: [], Cancelled: [] };
    for (const booking of bookings) {
      grouped[tabForBooking(booking)].push(booking);
    }
    const timeOf = (b: Booking) => new Date(b.start ?? b.end ?? 0).getTime();
    grouped.Upcoming.sort((a, b) => timeOf(a) - timeOf(b)); // soonest first
    grouped.Completed.sort((a, b) => timeOf(b) - timeOf(a)); // most recent first
    grouped.Cancelled.sort((a, b) => timeOf(b) - timeOf(a));
    return grouped;
  }, [bookings]);

  const visible = byTab[selectedTab];

  function openNewBooking() {
    setNotice(null);
    setError(null);
    setViewMode("new");
    setNewBooking({
      name: "",
      email: "",
      start_time: toLocalInputValue(new Date(Date.now() + 3600000).toISOString()),
      notes: "",
    });
  }

  function openReschedule(booking: Booking) {
    setNotice(null);
    setError(null);
    setSelectedBooking(booking);
    setRescheduleTime(toLocalInputValue(booking.start));
    setViewMode("reschedule");
  }

  function handleJoin(booking: Booking) {
    if (booking.meeting_url) window.open(booking.meeting_url, "_blank", "noopener,noreferrer");
  }

  async function handleCancel(booking: Booking) {
    if (!window.confirm(`Cancel "${booking.title}"?`)) return;
    setBusyKey(booking.id || booking.uid);
    setError(null);
    setNotice(null);
    try {
      await cancelBooking(booking.id || booking.uid);
      setNotice(`Cancelled "${booking.title}".`);
      setSelectedBooking(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel booking");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleRescheduleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedBooking || !rescheduleTime) return;
    const iso = toIsoFromLocalInput(rescheduleTime);
    if (!iso) {
      setError("Please choose a valid date and time.");
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await rescheduleBooking(selectedBooking.id || selectedBooking.uid, iso);
      setNotice(`Rescheduled "${selectedBooking.title}".`);
      setViewMode("list");
      setSelectedBooking(null);
      setRescheduleTime("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reschedule booking");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateBooking(e: React.FormEvent) {
    e.preventDefault();
    if (!newBooking.name || !newBooking.email || !newBooking.start_time) return;
    const iso = toIsoFromLocalInput(newBooking.start_time);
    if (!iso) {
      setError("Please choose a valid date and time.");
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const result = await createBooking({
        name: newBooking.name,
        email: newBooking.email,
        start_time: iso,
        time_zone: browserTimeZone(),
        notes: newBooking.notes || undefined,
      });
      setNotice(
        result.confirmation_url
          ? `Appointment created. Confirmation: ${result.confirmation_url}`
          : `Appointment for ${newBooking.email} created successfully.`,
      );
      setNewBooking({ name: "", email: "", start_time: "", notes: "" });
      setViewMode("list");
      setSelectedTab("Upcoming");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create booking");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="dashboard-main">
      <header className="dashboard-header">
        <div>
          <h1>Appointments</h1>
          <p>Real bookings from your connected Cal.com account</p>
        </div>
        <div className="header-actions">
          <button className="glass-button" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={17} /> Refresh
          </button>
          <button className="primary-button" onClick={openNewBooking} disabled={viewMode !== "list"}>
            <Plus size={18} /> New Appointment
          </button>
        </div>
      </header>

      {notice && (
        <div className="panel" style={{ display: "flex", gap: 10, alignItems: "center", borderColor: "rgba(87,242,135,0.4)" }}>
          <CheckCircle2 size={18} color="#57f287" />
          <span style={{ color: "#d7e4ff", fontSize: 14, overflowWrap: "anywhere" }}>{notice}</span>
        </div>
      )}

      {error && viewMode === "list" && (
        <div className="panel" style={{ display: "flex", gap: 10, alignItems: "center", borderColor: "rgba(255,80,108,0.4)" }}>
          <AlertTriangle size={18} color="#ff506e" />
          <span style={{ color: "#ffb3c0", fontSize: 14, overflowWrap: "anywhere" }}>{error}</span>
        </div>
      )}

      {viewMode !== "list" && (
        <div style={{ marginBottom: 24 }}>
          <button className="glass-button" onClick={() => { setViewMode("list"); setSelectedBooking(null); setError(null); }}>
            <X size={16} /> Back to List
          </button>
        </div>
      )}

      {viewMode === "new" && (
        <Panel title="New Appointment">
          {error && (
            <p style={{ color: "#ff506e", marginTop: 0, fontSize: 14 }}>
              <AlertTriangle size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
              {error}
            </p>
          )}
          <form onSubmit={handleCreateBooking} style={{ display: "grid", gap: 16, maxWidth: 420 }}>
            <Field label="Attendee Name *">
              <input
                type="text"
                value={newBooking.name}
                onChange={(e) => setNewBooking({ ...newBooking, name: e.target.value })}
                required
                style={inputStyle}
              />
            </Field>
            <Field label="Attendee Email *">
              <input
                type="email"
                value={newBooking.email}
                onChange={(e) => setNewBooking({ ...newBooking, email: e.target.value })}
                required
                style={inputStyle}
              />
            </Field>
            <Field label={`Start Time * (${browserTimeZone()})`}>
              <input
                type="datetime-local"
                value={newBooking.start_time}
                onChange={(e) => setNewBooking({ ...newBooking, start_time: e.target.value })}
                required
                style={inputStyle}
              />
            </Field>
            <Field label="Notes">
              <input
                type="text"
                value={newBooking.notes}
                onChange={(e) => setNewBooking({ ...newBooking, notes: e.target.value })}
                placeholder="Optional context for the meeting"
                style={inputStyle}
              />
            </Field>
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 8 }}>
              <button type="button" className="glass-button" onClick={() => { setViewMode("list"); setError(null); }}>Cancel</button>
              <button type="submit" className="primary-button" disabled={saving}>
                <Plus size={16} /> {saving ? "Creating…" : "Create Appointment"}
              </button>
            </div>
          </form>
        </Panel>
      )}

      {viewMode === "reschedule" && selectedBooking && (
        <Panel title={`Reschedule: ${selectedBooking.title}`}>
          {error && (
            <p style={{ color: "#ff506e", marginTop: 0, fontSize: 14 }}>
              <AlertTriangle size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
              {error}
            </p>
          )}
          <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
            Current time: {fmtDateTime(selectedBooking.start)} ({browserTimeZone()})
          </p>
          <form onSubmit={handleRescheduleSubmit}>
            <Field label="New Start Time *">
              <input
                type="datetime-local"
                value={rescheduleTime}
                onChange={(e) => setRescheduleTime(e.target.value)}
                required
                style={inputStyle}
              />
            </Field>
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 8 }}>
              <button
                type="button"
                className="glass-button"
                onClick={() => { setViewMode("list"); setSelectedBooking(null); setError(null); }}
              >
                Cancel
              </button>
              <button type="submit" className="primary-button" disabled={saving}>
                <Clock size={16} /> {saving ? "Saving…" : "Reschedule"}
              </button>
            </div>
          </form>
        </Panel>
      )}

      {viewMode === "list" && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
            {TABS.map((tab) => (
              <button
                key={tab}
                className="glass-button"
                style={{ background: selectedTab === tab ? "rgba(255,255,255,0.18)" : undefined }}
                onClick={() => setSelectedTab(tab)}
              >
                {tab} ({byTab[tab].length})
              </button>
            ))}
          </div>

          {loading && <p className="muted">Loading bookings from Cal.com…</p>}

          {!loading && error && (
            <div className="panel">
              <p style={{ color: "#ff506e", marginTop: 0 }}>{error}</p>
              <p className="muted" style={{ fontSize: 13 }}>
                Appointments come from your live Cal.com account. Check the Cal.com credentials in Settings → Integrations, then retry.
              </p>
              <button className="glass-button" style={{ marginTop: 12 }} onClick={() => void load()}>
                <RefreshCw size={16} /> Retry
              </button>
            </div>
          )}

          {!loading && !error && visible.length === 0 && (
            <div className="panel">
              <p className="muted" style={{ margin: 0 }}>
                {bookings.length === 0
                  ? "No bookings found in your Cal.com account yet. New bookings will appear here automatically."
                  : `No ${selectedTab.toLowerCase()} appointments.`}
              </p>
            </div>
          )}

          {!loading && !error && visible.length > 0 && (
            <div style={{ display: "grid", gap: 24, gridTemplateColumns: selectedBooking ? "minmax(0, 1fr) 320px" : "1fr" }}>
              <div>
                {visible.map((booking) => (
                  <AppointmentRow
                    key={booking.id || booking.uid}
                    booking={booking}
                    selected={selectedBooking?.id === booking.id && selectedBooking?.uid === booking.uid}
                    busy={busyKey === (booking.id || booking.uid)}
                    onClick={() => setSelectedBooking(booking)}
                    onJoin={handleJoin}
                    onCancel={(b) => void handleCancel(b)}
                    onReschedule={openReschedule}
                  />
                ))}
              </div>

              {selectedBooking && (
                <Panel title="Booking Details">
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                    <strong>{selectedBooking.title}</strong>
                    <button
                      className="glass-button"
                      style={{ minHeight: 32, padding: "0 8px" }}
                      onClick={() => setSelectedBooking(null)}
                      aria-label="Close details"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                    {relativeStartLabel(selectedBooking.start)}
                  </p>
                  <div style={{ display: "grid", gap: 10, marginTop: 16, fontSize: 14 }}>
                    <div>
                      <span className="muted">Status</span>
                      <br />
                      <strong style={{ color: statusColor(selectedBooking.status) }}>{statusLabel(selectedBooking.status)}</strong>
                    </div>
                    <div>
                      <span className="muted">Start</span>
                      <br />
                      {fmtDateTime(selectedBooking.start)}
                    </div>
                    <div>
                      <span className="muted">End</span>
                      <br />
                      {fmtDateTime(selectedBooking.end)}
                    </div>
                    {durationMinutes(selectedBooking) && (
                      <div>
                        <span className="muted">Duration</span>
                        <br />
                        {durationMinutes(selectedBooking)} min
                      </div>
                    )}
                    <div>
                      <span className="muted">Booked</span>
                      <br />
                      {fmtDateTime(selectedBooking.created_at)}
                    </div>
                    <div>
                      <span className="muted">Attendees</span>
                      <br />
                      {selectedBooking.attendees.length === 0
                        ? "—"
                        : selectedBooking.attendees.map((a) => (
                            <div key={a.email || a.name}>
                              <Users size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
                              {a.name || "Attendee"}
                              {a.email ? ` <${a.email}>` : ""}
                            </div>
                          ))}
                    </div>
                  </div>

                  {!isCancelled(selectedBooking) && (
                    <div style={{ display: "grid", gap: 8, marginTop: 16 }}>
                      {selectedBooking.meeting_url && (
                        <button className="glass-button" style={{ justifyContent: "center" }} onClick={() => handleJoin(selectedBooking)}>
                          <Video size={14} /> Join Meeting
                        </button>
                      )}
                      <button className="glass-button" style={{ justifyContent: "center" }} onClick={() => openReschedule(selectedBooking)}>
                        <Clock size={14} /> Reschedule
                      </button>
                      <button
                        className="glass-button"
                        style={{ justifyContent: "center", color: "#ff506e", borderColor: "rgba(255,80,108,0.3)" }}
                        onClick={() => void handleCancel(selectedBooking)}
                      >
                        <X size={14} /> Cancel Appointment
                      </button>
                    </div>
                  )}
                </Panel>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.18)",
  borderRadius: 8,
  padding: "10px 12px",
  color: "#fff",
  fontSize: 14,
  boxSizing: "border-box",
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label style={{ display: "block", color: "#d7e4ff", fontSize: 13, marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

function Panel({ title, className = "", children }: { title?: string; className?: string; children: ReactNode }) {
  return (
    <article className={`panel ${className}`}>
      {title && <h2>{title}</h2>}
      {children}
    </article>
  );
}

export default AppointmentsPage;
