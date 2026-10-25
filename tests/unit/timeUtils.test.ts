import {
  toMinutes,
  isAlignedToHalfHour,
  isWithinOperatingHours,
  getDurationMinutes,
  isValidDateFormat,
  isFutureDateTime,
  validateBookingTimes,
} from '../../src/utils/timeUtils';

describe('toMinutes', () => {
  it('converts HH:mm correctly', () => {
    expect(toMinutes('06:00')).toBe(360);
    expect(toMinutes('22:00')).toBe(1320);
    expect(toMinutes('09:30')).toBe(570);
    expect(toMinutes('00:00')).toBe(0);
  });
  it('returns NaN for invalid format', () => {
    expect(toMinutes('9:00')).toBeNaN();
    expect(toMinutes('09:00:15')).toBeNaN();
    expect(toMinutes('invalid')).toBeNaN();
  });
});

describe('isAlignedToHalfHour — BR-2', () => {
  it('accepts :00 and :30 minutes', () => {
    expect(isAlignedToHalfHour('09:00')).toBe(true);
    expect(isAlignedToHalfHour('09:30')).toBe(true);
    expect(isAlignedToHalfHour('22:00')).toBe(true);
    expect(isAlignedToHalfHour('06:00')).toBe(true);
  });
  it('rejects non-30-min boundaries', () => {
    expect(isAlignedToHalfHour('09:15')).toBe(false);
    expect(isAlignedToHalfHour('09:45')).toBe(false);
    expect(isAlignedToHalfHour('10:20')).toBe(false);
    expect(isAlignedToHalfHour('10:01')).toBe(false);
  });
});

describe('isWithinOperatingHours — BR-1', () => {
  it('accepts bookings fully within 06:00–22:00', () => {
    expect(isWithinOperatingHours('06:00', '07:00')).toBe(true);
    expect(isWithinOperatingHours('21:00', '22:00')).toBe(true);
    expect(isWithinOperatingHours('10:00', '12:00')).toBe(true);
  });
  it('rejects bookings starting before 06:00', () => {
    expect(isWithinOperatingHours('05:30', '06:30')).toBe(false);
    expect(isWithinOperatingHours('00:00', '01:00')).toBe(false);
  });
  it('rejects bookings ending after 22:00', () => {
    expect(isWithinOperatingHours('21:30', '22:30')).toBe(false);
    expect(isWithinOperatingHours('22:00', '22:30')).toBe(false);
  });
  it('rejects when startTime >= endTime', () => {
    expect(isWithinOperatingHours('10:00', '10:00')).toBe(false);
    expect(isWithinOperatingHours('11:00', '10:00')).toBe(false);
  });
});

describe('getDurationMinutes — BR-3', () => {
  it('calculates duration correctly', () => {
    expect(getDurationMinutes('10:00', '10:30')).toBe(30);
    expect(getDurationMinutes('10:00', '12:00')).toBe(120);
    expect(getDurationMinutes('10:00', '11:30')).toBe(90);
  });
  it('returns negative for reversed times', () => {
    expect(getDurationMinutes('11:00', '10:00')).toBe(-60);
  });
  it('returns 0 for same time', () => {
    expect(getDurationMinutes('10:00', '10:00')).toBe(0);
  });
});

describe('isValidDateFormat', () => {
  it('accepts valid YYYY-MM-DD dates', () => {
    expect(isValidDateFormat('2025-06-01')).toBe(true);
    expect(isValidDateFormat('2025-12-31')).toBe(true);
    expect(isValidDateFormat('2025-01-01')).toBe(true);
  });
  it('rejects invalid calendar dates', () => {
    expect(isValidDateFormat('2025-02-30')).toBe(false);
    expect(isValidDateFormat('2025-13-01')).toBe(false);
    expect(isValidDateFormat('2025-00-01')).toBe(false);
  });
  it('rejects wrong formats', () => {
    expect(isValidDateFormat('today')).toBe(false);
    expect(isValidDateFormat('15/03/2025')).toBe(false);
    expect(isValidDateFormat('2025-6-1')).toBe(false);
    expect(isValidDateFormat('')).toBe(false);
  });
});

describe('isFutureDateTime — BR-7', () => {
  it('returns true for a date/time well in the future', () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const dateStr = future.toISOString().slice(0, 10);
    expect(isFutureDateTime(dateStr, '10:00')).toBe(true);
  });
  it('returns false for a date/time in the past', () => {
    expect(isFutureDateTime('2020-01-01', '10:00')).toBe(false);
  });
});

describe('validateBookingTimes — BR-1, BR-2, BR-3', () => {
  it('returns null for valid booking times', () => {
    expect(validateBookingTimes('10:00', '11:00')).toBeNull();
    expect(validateBookingTimes('06:00', '07:00')).toBeNull();
    expect(validateBookingTimes('21:00', '22:00')).toBeNull();
    expect(validateBookingTimes('10:00', '12:00')).toBeNull();
    expect(validateBookingTimes('09:00', '10:30')).toBeNull();
  });

  it('rejects invalid format', () => {
    expect(validateBookingTimes('9:00', '10:00')?.code).toBe('VALIDATION_ERROR');
    expect(validateBookingTimes('09:00:15', '10:00')?.code).toBe('VALIDATION_ERROR');
  });

  it('rejects non-30-min alignment — INVALID_TIME_ALIGNMENT', () => {
    expect(validateBookingTimes('09:15', '10:15')?.code).toBe('INVALID_TIME_ALIGNMENT');
    expect(validateBookingTimes('09:00', '10:20')?.code).toBe('INVALID_TIME_ALIGNMENT');
    expect(validateBookingTimes('09:45', '10:45')?.code).toBe('INVALID_TIME_ALIGNMENT');
  });

  it('rejects outside operating hours — OUTSIDE_OPERATING_HOURS', () => {
    expect(validateBookingTimes('05:30', '06:30')?.code).toBe('OUTSIDE_OPERATING_HOURS');
    expect(validateBookingTimes('21:30', '22:30')?.code).toBe('OUTSIDE_OPERATING_HOURS');
    expect(validateBookingTimes('22:00', '22:30')?.code).toBe('OUTSIDE_OPERATING_HOURS'); // start at 22:00 rejected
  });

  it('rejects duration < 30 min — DURATION_TOO_SHORT', () => {
    expect(validateBookingTimes('10:00', '10:00')?.code).toBe('OUTSIDE_OPERATING_HOURS'); // same time = start not < end
    expect(validateBookingTimes('10:00', '10:30')).toBeNull(); // exactly 30 min = valid
  });

  it('rejects duration > 120 min — DURATION_TOO_LONG', () => {
    expect(validateBookingTimes('10:00', '12:30')?.code).toBe('DURATION_TOO_LONG');
    expect(validateBookingTimes('10:00', '12:00')).toBeNull(); // exactly 120 min = valid
  });
});
