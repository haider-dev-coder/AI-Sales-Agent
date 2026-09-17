// Shared Cal.com frontend helpers: types, API client, and formatting utilities.
// Kept framework-free so both AppointmentsPage and AppointmentRow can import it.

export type Attendee = { name: string; email: string; time_zone?: string };

export type Booking = {
  id: string;
  uid: string;
  title: string;
  start: string | null;
  end: string | null;
  status: string;
  attendees: Attendee[];
  meeting_url: string | null;
  created_at: string | null;
};

export type AvailabilitySlot = { start: string; end: string };

const apiUrl = (
  import.meta.env.VITE_API_URL ??
  `${window.location.protocol}//${window.location.hostname}:8001`
).replace(/\/$/, "");

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const data = await response.json();
    const detail = data?.detail ?? data?.error?.message ?? data?.message;
    if (typeof detail === "string" && detail.trim()) return detail;
  } catch {
    // response was not JSON; fall through to the generic message
  }
  return `${fallback} (HTTP ${response.status})`;
}

export async function fetchBookings(): Promise<Booking[]> {
  const response = await fetch(`${apiUrl}/api/cal/bookings`);
  if (!response.ok) throw new Error(await readError(response, "Failed to load bookings"));
  const data = (await response.json()) as { bookings?: Booking[] };
  return data.bookings ?? [];
}

export async function fetchAvailability(): Promise<AvailabilitySlot[]> {
  const response = await fetch(`${apiUrl}/api/cal/availability`);
  if (!response.ok) throw new Error(await readError(response, "Failed to load availability"));
  const data = (await response.json()) as { slots?: AvailabilitySlot[] };
  return data.slots ?? [];
}

export type CreateBookingInput = {
  name: string;
  email: string;
  start_time: string; // ISO 8601 UTC
  time_zone?: string;
  notes?: string;
};

export async function createBooking(input: CreateBookingInput): Promise<{ booking_id: string; confirmation_url: string }> {
  const response = await fetch(`${apiUrl}/api/cal/book`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await readError(response, "Failed to create booking"));
  return (await response.json()) as { booking_id: string; confirmation_url: string };
}

export async function cancelBooking(bookingId: string, reason?: string): Promise<void> {
  const query = reason ? `?reason=${encodeURIComponent(reason)}` : "";
  const response = await fetch(`${apiUrl}/api/cal/bookings/${bookingId}/cancel${query}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason: reason ?? null }),
  });
  if (!response.ok) throw new Error(await readError(response, "Failed to cancel booking"));
}

export async function rescheduleBooking(bookingId: string, startTime: string): Promise<void> {
  const response = await fetch(`${apiUrl}/api/cal/bookings/${bookingId}/reschedule`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ start_time: startTime }),
  });
  if (!response.ok) throw new Error(await readError(response, "Failed to reschedule booking"));
}

// ---- Identifiers -----------------------------------------------------------

/** Cal.com operations use the numeric id when available, else the uid. */
export function bookingKey(booking: Booking): string {
  return booking.id || booking.uid;
}

// ---- Status helpers --------------------------------------------------------

export function normalizeStatus(status: string): string {
  return (status || "accepted").toLowerCase();
}

export function isCancelled(booking: Booking): boolean {
  const status = normalizeStatus(booking.status);
  return status.includes("cancel") || status.includes("reject");
}

export function isPast(booking: Booking): boolean {
  if (!booking.end && !booking.start) return false;
  const reference = booking.end ?? booking.start;
  return reference ? new Date(reference).getTime() < Date.now() : false;
}

export type BookingTab = "Upcoming" | "Completed" | "Cancelled";

export function tabForBooking(booking: Booking): BookingTab {
  if (isCancelled(booking)) return "Cancelled";
  const status = normalizeStatus(booking.status);
  if (status.includes("completed")) return "Completed";
  // Accepted/pending bookings in the past count as completed.
  return isPast(booking) ? "Completed" : "Upcoming";
}

export function statusColor(status: string): string {
  const normalized = normalizeStatus(status);
  if (normalized.includes("cancel") || normalized.includes("reject")) return "#ff506e";
  if (normalized.includes("pending") || normalized.includes("reschedul")) return "#ffad3d";
  return "#57f287";
}

export function statusLabel(status: string): string {
  const normalized = normalizeStatus(status);
  if (normalized.includes("reschedul")) return "Rescheduled";
  if (normalized.includes("cancel")) return "Cancelled";
  if (normalized.includes("reject")) return "Rejected";
  if (normalized.includes("pending")) return "Pending";
  if (normalized.includes("completed")) return "Completed";
  if (normalized === "accepted") return "Confirmed";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

// ---- Date/time helpers -----------------------------------------------------

export function fmtDateTime(value: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString();
}

export function fmtTime(value: string | null): string {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? ""
    : parsed.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function durationMinutes(booking: Booking | { start: string | null; end: string | null }): number | null {
  if (!booking.start || !booking.end) return null;
  const minutes = Math.round((new Date(booking.end).getTime() - new Date(booking.start).getTime()) / 60000);
  return minutes > 0 ? minutes : null;
}

/**
 * Short label used next to the booking title (matches the Cal.com-style UI):
 * Today 2:00 PM, Tomorrow 10:00 AM, or Jun 14 3:00 PM.
 */
export function relativeStartLabel(value: string | null): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const time = fmtTime(value);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfDate = new Date(parsed);
  startOfDate.setHours(0, 0, 0, 0);
  const dayDiff = Math.round((startOfDate.getTime() - startOfToday.getTime()) / 86400000);
  if (dayDiff === 0) return `Today ${time}`;
  if (dayDiff === 1) return `Tomorrow ${time}`;
  if (dayDiff === -1) return `Yesterday ${time}`;
  return `${parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${time}`;
}

/** Convert an ISO timestamp to a value usable by <input type="datetime-local">. */
export function toLocalInputValue(value: string | null): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const offsetMs = parsed.getTimezoneOffset() * 60000;
  return new Date(parsed.getTime() - offsetMs).toISOString().slice(0, 16);
}

/** Convert a <input type="datetime-local"> value into an ISO 8601 UTC string. */
export function toIsoFromLocalInput(value: string): string {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}

export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
