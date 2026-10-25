import { AppError } from '../errors/AppError';
import { pool } from '../db/pool';
import { getAllCourts, findCourtById, getActiveBookingsForCourtOnDate } from '../repositories/courts.repository';
import { isValidDateFormat, toMinutes, combineDateAndTime } from '../utils/timeUtils';
import { Booking } from '../types/models';

interface TimeSlot {
  startTime: string;
  endTime: string;
}

/**
 * Subtract booked intervals from the operating window [06:00, 22:00]
 * and return the remaining free slots.
 */
function computeFreeSlots(activeBookings: Booking[]): TimeSlot[] {
  const OP_START = 360;  // 06:00 in minutes
  const OP_END = 1320;   // 22:00 in minutes

  // Sort bookings by start time
  const sorted = [...activeBookings].sort(
    (a, b) => toMinutes(a.startTime) - toMinutes(b.startTime)
  );

  const free: TimeSlot[] = [];
  let cursor = OP_START;

  for (const booking of sorted) {
    const bStart = toMinutes(booking.startTime);
    const bEnd = toMinutes(booking.endTime);
    if (bStart > cursor) {
      free.push({
        startTime: minutesToHHmm(cursor),
        endTime: minutesToHHmm(bStart),
      });
    }
    cursor = Math.max(cursor, bEnd);
  }

  if (cursor < OP_END) {
    free.push({ startTime: minutesToHHmm(cursor), endTime: minutesToHHmm(OP_END) });
  }

  return free;
}

function minutesToHHmm(mins: number): string {
  const h = Math.floor(mins / 60).toString().padStart(2, '0');
  const m = (mins % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Apply lazy completion: return bookings whose end datetime has passed,
 * and persist their status update to the DB.
 */
async function applyLazyCompletion(bookings: Booking[]): Promise<Booking[]> {
  const now = Date.now();
  const toComplete = bookings.filter(
    (b) => b.status === 'active' && combineDateAndTime(b.date, b.endTime).getTime() <= now
  );

  if (toComplete.length > 0) {
    const ids = toComplete.map((b) => b.id);
    await pool.query(
      `UPDATE bookings SET status = 'completed' WHERE id = ANY($1::int[]) AND status = 'active'`,
      [ids]
    );
    toComplete.forEach((b) => { b.status = 'completed'; });
  }

  return bookings;
}

export async function listCourts() {
  return getAllCourts();
}

export async function getAvailability(courtId: number, date: string) {
  if (!isValidDateFormat(date)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'date must be a valid YYYY-MM-DD format');
  }

  const court = await findCourtById(courtId);
  if (!court) {
    throw new AppError(404, 'COURT_NOT_FOUND', `Court with id ${courtId} not found`);
  }

  const bookings = await getActiveBookingsForCourtOnDate(courtId, date);
  await applyLazyCompletion(bookings);

  const activeBookings = bookings.filter((b) => b.status === 'active');
  const freeSlots = computeFreeSlots(activeBookings);
  const bookedSlots: TimeSlot[] = activeBookings.map((b) => ({
    startTime: b.startTime,
    endTime: b.endTime,
  }));

  return { court, date, freeSlots, bookedSlots };
}
