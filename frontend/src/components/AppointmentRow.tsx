import { Calendar, Clock, Users, Video, X } from "lucide-react";
import type { Booking } from "./calcom";
import {
  durationMinutes,
  isCancelled,
  relativeStartLabel,
  statusColor,
  statusLabel,
} from "./calcom";

interface AppointmentRowProps {
  booking: Booking;
  selected?: boolean;
  busy?: boolean;
  onClick: () => void;
  onJoin: (booking: Booking) => void;
  onCancel: (booking: Booking) => void;
  onReschedule: (booking: Booking) => void;
}

export function AppointmentRow({
  booking,
  selected = false,
  busy = false,
  onClick,
  onJoin,
  onCancel,
  onReschedule,
}: AppointmentRowProps) {
  const duration = durationMinutes(booking);
  const cancelled = isCancelled(booking);
  const attendeeLabel = booking.attendees
    .map((a) => a.name || a.email)
    .filter(Boolean)
    .join(", ");

  return (
    <div
      className="panel"
      style={{
        marginBottom: 16,
        cursor: "pointer",
        borderColor: selected ? "rgba(0,212,255,0.6)" : undefined,
        boxShadow: selected ? "inset 0 0 0 1px rgba(0,212,255,0.5)" : undefined,
        opacity: busy ? 0.6 : 1,
      }}
      onClick={onClick}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
            <strong style={{ fontSize: 15 }}>{booking.title}</strong>
            <span style={{ color: "#8892b0", fontSize: 12 }}>{relativeStartLabel(booking.start)}</span>
          </div>
          <div style={{ color: "#8892b0", fontSize: 13, marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
            <Calendar size={13} />
            <span>
              {duration ? `${duration} min` : "Scheduled"}
            </span>
          </div>
          {attendeeLabel && (
            <div style={{ color: "#d7e4ff", fontSize: 13, marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
              <Users size={13} />
              <span>{attendeeLabel}</span>
            </div>
          )}
        </div>
        <span
          style={{
            background: "rgba(255,255,255,0.1)",
            borderRadius: 20,
            padding: "4px 12px",
            color: statusColor(booking.status),
            fontWeight: 600,
            fontSize: 12,
            whiteSpace: "nowrap",
          }}
        >
          {statusLabel(booking.status)}
        </span>
      </div>

      {!cancelled && booking.meeting_url && (
        <button
          type="button"
          className="glass-button"
          style={{ width: "100%", justifyContent: "center", marginTop: 16, minHeight: 38, color: "#72c9ff" }}
          onClick={(e) => {
            e.stopPropagation();
            onJoin(booking);
          }}
        >
          <Video size={15} /> Join Meeting
        </button>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: 18,
          marginTop: 14,
          fontSize: 13,
        }}
      >
        {!cancelled && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCancel(booking);
              }}
              disabled={busy}
              style={{
                background: "none",
                border: 0,
                color: "#ff506e",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: 4,
              }}
            >
              <X size={14} /> Cancel
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onReschedule(booking);
              }}
              disabled={busy}
              style={{
                background: "none",
                border: 0,
                color: "#72c9ff",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: 4,
              }}
            >
              <Clock size={14} /> Reschedule
            </button>
          </>
        )}
      </div>
    </div>
  );
}

