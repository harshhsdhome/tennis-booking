import { pool } from '../db/pool';
import { AppError } from '../errors/AppError';
import { logger } from '../utils/logger';
import { findCourtById } from '../repositories/courts.repository';
import {
  countActiveBookingsForUserOnDate,
  countActiveFutureBookingsForUser,
  getOverlappingBookings,
  insertBooking,
  updateBookingStatusBatch,
  getBookingsForUser,
  findBookingById,
  updateBookingStatus,
} from '../repositories/bookings.repository';
import {
  isValidDateFormat,
  isFutureDateTime,
  validateBookingTimes,
  combineDateAndTime,
} from '../utils/timeUtils';
import { Booking, BookingWithCourt } from '../types/models';

/** Return current date and time as YYYY-MM-DD and HH:mm strings */
function nowParts(): { nowDate: string; nowTime: string } {
  const now = new Date();
  const nowDate = now.toISOString().slice(0, 10);
  const h = now.getHours().toString().padStart(2, '0');
  const m = now.getMinutes().toString().padStart(2, '0');
  return { nowDate, nowTime: `${h}:${m}` };
}

/**
 * Apply lazy completion to a list of bookings in-memory and persist updates.
 * Returns the same array with statuses updated. SD-3 / FR-6
 */
async function applyLazyCompletion(bookings: Booking[]): Promise<Booking[]> {
  const now = Date.now();
  const toComplete = bookings.filter(
    (b) => b.status === 'active' && combineDateAndTime(b.date, b.endTime).getTime() <= now
  );
  if (toComplete.length > 0) {
    await updateBookingStatusBatch(toComplete.map((b) => b.id), 'completed');
    toComplete.forEach((b) => { b.status = 'completed'; });
  }
  return bookings;
}

export async function createBooking(
  userId: number,
  input: { courtId: number; date: string; startTime: string; endTime: string }
): Promise<Booking> {
  const { courtId, date, startTime, endTime } = input;

  // Basic presence validation
  if (!courtId || !date || !startTime || !endTime) {
    throw new AppError(400, 'VALIDATION_ERROR', 'courtId, date, startTime, and endTime are required');
  }

  // Verify court exists (outside transaction — read-only)
  const court = await findCourtById(courtId);
  if (!court) {
    throw new AppError(404, 'COURT_NOT_FOUND', `Court with id ${courtId} not found`);
  }

  // Validate date format
  if (!isValidDateFormat(date)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'date must be a valid YYYY-MM-DD format');
  }

  // Validate time fields: BR-1, BR-2, BR-3
  const timeError = validateBookingTimes(startTime, endTime);
  if (timeError) {
    throw new AppError(400, timeError.code, timeError.message);
  }

  // BR-7: start must be strictly in the future
  if (!isFutureDateTime(date, startTime)) {
    throw new AppError(400, 'CANNOT_BOOK_PAST_TIME', 'Booking start time must be in the future');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { nowDate, nowTime } = nowParts();

    // Apply lazy completion for this user's existing bookings so BR-5/BR-6 counts are accurate
    const existingBookings = await client.query(
      `SELECT * FROM bookings WHERE user_id = $1 AND status = 'active'`,
      [userId]
    );
    const activeIds: number[] = existingBookings.rows
      .filter((r: Record<string, unknown>) => {
        // date is now a plain string (YYYY-MM-DD) due to pg type parser
        const d = r['date'] as string;
        const endT = r['end_time'] as string;
        return combineDateAndTime(d, endT).getTime() <= Date.now();
      })
      .map((r: Record<string, unknown>) => r['id'] as number);

    if (activeIds.length > 0) {
      await updateBookingStatusBatch(activeIds, 'completed', client);
    }

    // BR-5: max 1 active booking per user per day
    const dailyCount = await countActiveBookingsForUserOnDate(client, userId, date);
    if (dailyCount >= 1) {
      throw new AppError(400, 'DAILY_BOOKING_LIMIT_EXCEEDED', 'You already have an active booking on this date');
    }

    // BR-6: max 2 active future bookings
    const futureCount = await countActiveFutureBookingsForUser(client, userId, nowDate, nowTime);
    if (futureCount >= 2) {
      throw new AppError(400, 'FUTURE_BOOKING_LIMIT_EXCEEDED', 'You already have 2 active future bookings');
    }

    // BR-4: no overlap with active bookings on same court+date
    const overlaps = await getOverlappingBookings(client, courtId, date, startTime, endTime);
    if (overlaps.length > 0) {
      throw new AppError(409, 'COURT_DOUBLE_BOOKING', 'This time slot is already booked');
    }

    const booking = await insertBooking(client, userId, courtId, date, startTime, endTime);
    await client.query('COMMIT');

    logger.info({
      action: 'BOOKING_CREATED',
      userId,
      bookingId: booking.id,
      courtId,
      date,
      startTime,
      endTime,
    });

    return booking;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getMyBookings(userId: number): Promise<BookingWithCourt[]> {
  const bookings = await getBookingsForUser(userId);

  // Apply lazy completion — this is a write operation (SD-3 / FR-6)
  const now = Date.now();
  const toComplete = bookings.filter(
    (b) => b.status === 'active' && combineDateAndTime(b.date, b.endTime).getTime() <= now
  );
  if (toComplete.length > 0) {
    await updateBookingStatusBatch(toComplete.map((b) => b.id), 'completed');
    toComplete.forEach((b) => { b.status = 'completed'; });
  }

  return bookings;
}

export async function cancelBooking(userId: number, bookingId: number): Promise<Booking> {
  const booking = await findBookingById(bookingId);

  // AC-4: not found
  if (!booking) {
    throw new AppError(404, 'BOOKING_NOT_FOUND', 'Booking not found');
  }

  // AC-4: ownership check BEFORE business rules — prevents info leakage
  if (booking.userId !== userId) {
    throw new AppError(403, 'FORBIDDEN', 'You do not have permission to cancel this booking');
  }

  // Status checks
  if (booking.status === 'cancelled') {
    throw new AppError(400, 'ALREADY_CANCELLED', 'This booking is already cancelled');
  }
  if (booking.status === 'completed') {
    throw new AppError(400, 'ALREADY_COMPLETED', 'This booking has already completed');
  }

  // BR-8: cancellation cut-off — must be >= 1 hour before start
  const startDateTime = combineDateAndTime(booking.date, booking.startTime);
  const cutoff = new Date(startDateTime.getTime() - 60 * 60 * 1000); // subtract 1 hour
  if (Date.now() > cutoff.getTime()) {
    throw new AppError(400, 'CANCELLATION_DEADLINE_PASSED', 'Cancellation is not allowed within 1 hour of the booking start time');
  }

  const updated = await updateBookingStatus(bookingId, 'cancelled');

  logger.info({
    action: 'BOOKING_CANCELLED',
    userId,
    bookingId,
    courtId: booking.courtId,
    date: booking.date,
    startTime: booking.startTime,
    endTime: booking.endTime,
  });

  return updated;
}
