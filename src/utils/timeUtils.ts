const HHMMM_REGEX = /^\d{2}:\d{2}$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const OPERATING_START = '06:00';
const OPERATING_END = '22:00';
const MIN_DURATION_MINS = 30;
const MAX_DURATION_MINS = 120;

/**
 * Converts a HH:mm string to total minutes since midnight.
 * Returns NaN if the format is invalid.
 */
export function toMinutes(time: string): number {
  if (!HHMMM_REGEX.test(time)) return NaN;
  const [h, m] = time.split(':').map(Number);
  return h! * 60 + m!;
}

/**
 * Returns true if the time string is aligned to a 30-minute boundary (:00 or :30). BR-2
 */
export function isAlignedToHalfHour(time: string): boolean {
  if (!HHMMM_REGEX.test(time)) return false;
  const mins = toMinutes(time);
  return mins % 30 === 0;
}

/**
 * Returns true if startTime >= 06:00, endTime <= 22:00, and startTime < endTime. BR-1
 */
export function isWithinOperatingHours(startTime: string, endTime: string): boolean {
  const start = toMinutes(startTime);
  const end = toMinutes(endTime);
  const opStart = toMinutes(OPERATING_START);
  const opEnd = toMinutes(OPERATING_END);
  return start >= opStart && end <= opEnd && start < end;
}

/**
 * Returns duration in minutes between two HH:mm strings.
 * Returns NaN if either is invalid or end <= start.
 */
export function getDurationMinutes(startTime: string, endTime: string): number {
  const start = toMinutes(startTime);
  const end = toMinutes(endTime);
  return end - start;
}

/**
 * Validates a YYYY-MM-DD date string including calendar validity. FR-2 / BR-7
 */
export function isValidDateFormat(date: string): boolean {
  if (!DATE_REGEX.test(date)) return false;
  const d = new Date(`${date}T00:00:00`);
  if (isNaN(d.getTime())) return false;
  // Ensure the parsed date matches the original string (catches 2025-02-30 etc.)
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}` === date;
}

/**
 * Combines a YYYY-MM-DD date and HH:mm time into a JS Date (server-local time). SD-2
 */
export function combineDateAndTime(date: string, time: string): Date {
  return new Date(`${date}T${time}:00`);
}

/**
 * Returns true if date + time is strictly in the future relative to now. BR-7 / SD-5
 */
export function isFutureDateTime(date: string, time: string): boolean {
  return combineDateAndTime(date, time).getTime() > Date.now();
}

/**
 * Validates all booking time fields in one pass. Returns the first failing rule code,
 * or null if valid. BR-1, BR-2, BR-3
 */
export function validateBookingTimes(
  startTime: string,
  endTime: string
): { code: string; message: string } | null {
  if (!HHMMM_REGEX.test(startTime) || !HHMMM_REGEX.test(endTime)) {
    return { code: 'VALIDATION_ERROR', message: 'startTime and endTime must be in HH:mm format' };
  }
  if (!isAlignedToHalfHour(startTime) || !isAlignedToHalfHour(endTime)) {
    return { code: 'INVALID_TIME_ALIGNMENT', message: 'startTime and endTime must be on 30-minute boundaries (:00 or :30)' };
  }
  if (!isWithinOperatingHours(startTime, endTime)) {
    return { code: 'OUTSIDE_OPERATING_HOURS', message: 'Booking must be within operating hours 06:00–22:00 and startTime must be before endTime' };
  }
  const duration = getDurationMinutes(startTime, endTime);
  if (duration < MIN_DURATION_MINS) {
    return { code: 'DURATION_TOO_SHORT', message: 'Booking duration must be at least 30 minutes' };
  }
  if (duration > MAX_DURATION_MINS) {
    return { code: 'DURATION_TOO_LONG', message: 'Booking duration must not exceed 120 minutes (2 hours)' };
  }
  return null;
}
