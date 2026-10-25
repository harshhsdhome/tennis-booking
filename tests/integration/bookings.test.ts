import request from 'supertest';
import app from '../../src/server';
import { pool } from '../../src/db/pool';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function registerAndLogin(email = 'user@example.com') {
  await request(app).post('/auth/register').send({ email, name: 'User', password: 'pass123' });
  const res = await request(app).post('/auth/login').send({ email, password: 'pass123' });
  return res.body.token as string;
}

function futureDate(daysAhead = 1): string {
  const d = new Date(Date.now() + daysAhead * 86400000);
  return d.toISOString().slice(0, 10);
}

function futureTime(): string {
  // Return a time slot that is 2+ hours from now, aligned to :00 or :30
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes() + 150; // +2.5 hours
  const aligned = Math.ceil(mins / 30) * 30;
  const h = Math.floor(aligned / 60) % 24;
  const m = aligned % 60;
  // If computed time is outside operating hours, use next day's 10:00
  if (h >= 21) return '10:00';
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h! * 60 + m! + mins;
  return `${Math.floor(total / 60).toString().padStart(2, '0')}:${(total % 60).toString().padStart(2, '0')}`;
}

beforeEach(async () => {
  await pool.query('DELETE FROM bookings');
  await pool.query('DELETE FROM users');
});

afterAll(async () => {
  await pool.end();
});

// ---------------------------------------------------------------------------
// POST /bookings — FR-3
// ---------------------------------------------------------------------------
describe('POST /bookings', () => {
  it('creates a booking and returns 201 with booking details', async () => {
    const token = await registerAndLogin();
    const date = futureDate(2);
    const startTime = '10:00';
    const res = await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ courtId: 1, date, startTime, endTime: '11:00' });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.status).toBe('active');
    expect(res.body.courtId).toBe(1);
    expect(res.body.date).toBe(date);
    expect(res.body.startTime).toBe(startTime);
  });

  it('requires authentication — 401 without token', async () => {
    const res = await request(app)
      .post('/bookings')
      .send({ courtId: 1, date: futureDate(2), startTime: '10:00', endTime: '11:00' });
    expect(res.status).toBe(401);
  });

  it('returns 400 for missing fields', async () => {
    const token = await registerAndLogin();
    const res = await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ courtId: 1, date: futureDate(2) });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 for unknown court id', async () => {
    const token = await registerAndLogin();
    const res = await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ courtId: 999, date: futureDate(2), startTime: '10:00', endTime: '11:00' });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('COURT_NOT_FOUND');
  });

  // BR-1
  it('BR-1: rejects booking outside operating hours', async () => {
    const token = await registerAndLogin();
    const date = futureDate(2);
    const res = await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ courtId: 1, date, startTime: '05:30', endTime: '06:30' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('OUTSIDE_OPERATING_HOURS');
  });

  it('BR-1: rejects booking ending after 22:00', async () => {
    const token = await registerAndLogin();
    const res = await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ courtId: 1, date: futureDate(2), startTime: '21:30', endTime: '22:30' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('OUTSIDE_OPERATING_HOURS');
  });

  // BR-2
  it('BR-2: rejects non-30-min-aligned times', async () => {
    const token = await registerAndLogin();
    const res = await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ courtId: 1, date: futureDate(2), startTime: '09:15', endTime: '10:15' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_TIME_ALIGNMENT');
  });

  // BR-3
  it('BR-3: rejects duration > 120 minutes', async () => {
    const token = await registerAndLogin();
    const res = await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ courtId: 1, date: futureDate(2), startTime: '10:00', endTime: '12:30' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('DURATION_TOO_LONG');
  });

  // BR-4
  it('BR-4: rejects overlapping booking on same court — 409 COURT_DOUBLE_BOOKING', async () => {
    const token = await registerAndLogin();
    const date = futureDate(3);
    await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ courtId: 1, date, startTime: '10:00', endTime: '11:00' });

    const token2 = await registerAndLogin('user2@example.com');
    const res = await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${token2}`)
      .send({ courtId: 1, date, startTime: '10:30', endTime: '11:30' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('COURT_DOUBLE_BOOKING');
  });

  it('BR-4: allows back-to-back bookings on same court', async () => {
    const token = await registerAndLogin();
    const token2 = await registerAndLogin('user2@example.com');
    const date = futureDate(3);
    await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ courtId: 1, date, startTime: '10:00', endTime: '11:00' });
    const res = await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${token2}`)
      .send({ courtId: 1, date, startTime: '11:00', endTime: '12:00' });
    expect(res.status).toBe(201);
  });

  it('BR-4: allows same time slot on different courts', async () => {
    const token = await registerAndLogin();
    const token2 = await registerAndLogin('user2@example.com');
    const date = futureDate(3);
    await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ courtId: 1, date, startTime: '10:00', endTime: '11:00' });
    const res = await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${token2}`)
      .send({ courtId: 2, date, startTime: '10:00', endTime: '11:00' });
    expect(res.status).toBe(201);
  });

  // BR-5
  it('BR-5: rejects 2nd booking for same user on same date', async () => {
    const token = await registerAndLogin();
    const date = futureDate(3);
    await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ courtId: 1, date, startTime: '10:00', endTime: '11:00' });
    const res = await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ courtId: 2, date, startTime: '14:00', endTime: '15:00' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('DAILY_BOOKING_LIMIT_EXCEEDED');
  });

  // BR-6
  it('BR-6: rejects 3rd active future booking', async () => {
    const token = await registerAndLogin();
    await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ courtId: 1, date: futureDate(3), startTime: '10:00', endTime: '11:00' });
    await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ courtId: 2, date: futureDate(4), startTime: '10:00', endTime: '11:00' });
    const res = await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ courtId: 3, date: futureDate(5), startTime: '10:00', endTime: '11:00' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('FUTURE_BOOKING_LIMIT_EXCEEDED');
  });

  // BR-7
  it('BR-7: rejects booking with past start time', async () => {
    const token = await registerAndLogin();
    const res = await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ courtId: 1, date: '2020-01-01', startTime: '10:00', endTime: '11:00' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('CANNOT_BOOK_PAST_TIME');
  });
});

// ---------------------------------------------------------------------------
// GET /bookings/mine — FR-4
// ---------------------------------------------------------------------------
describe('GET /bookings/mine', () => {
  it('returns empty array for user with no bookings', async () => {
    const token = await registerAndLogin();
    const res = await request(app)
      .get('/bookings/mine')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns bookings with courtName included', async () => {
    const token = await registerAndLogin();
    await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ courtId: 1, date: futureDate(2), startTime: '10:00', endTime: '11:00' });
    const res = await request(app)
      .get('/bookings/mine')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].courtName).toBeDefined();
  });

  it('only returns bookings for the authenticated user — AC-4', async () => {
    const token1 = await registerAndLogin('a@example.com');
    const token2 = await registerAndLogin('b@example.com');
    await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${token1}`)
      .send({ courtId: 1, date: futureDate(2), startTime: '10:00', endTime: '11:00' });
    const res = await request(app)
      .get('/bookings/mine')
      .set('Authorization', `Bearer ${token2}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/bookings/mine');
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// DELETE /bookings/:id/cancel — FR-5 / BR-8
// ---------------------------------------------------------------------------
describe('DELETE /bookings/:id/cancel', () => {
  it('cancels an eligible booking and returns updated booking', async () => {
    const token = await registerAndLogin();
    const createRes = await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ courtId: 1, date: futureDate(2), startTime: '10:00', endTime: '11:00' });
    const bookingId = createRes.body.id;
    const res = await request(app)
      .delete(`/bookings/${bookingId}/cancel`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelled');
  });

  it('returns 404 for non-existent booking id', async () => {
    const token = await registerAndLogin();
    const res = await request(app)
      .delete('/bookings/99999/cancel')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('BOOKING_NOT_FOUND');
  });

  it('returns 403 when user tries to cancel another user booking — AC-4', async () => {
    const token1 = await registerAndLogin('owner@example.com');
    const token2 = await registerAndLogin('other@example.com');
    const createRes = await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${token1}`)
      .send({ courtId: 1, date: futureDate(2), startTime: '10:00', endTime: '11:00' });
    const bookingId = createRes.body.id;
    const res = await request(app)
      .delete(`/bookings/${bookingId}/cancel`)
      .set('Authorization', `Bearer ${token2}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('returns 400 when trying to cancel an already cancelled booking', async () => {
    const token = await registerAndLogin();
    const createRes = await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ courtId: 1, date: futureDate(2), startTime: '10:00', endTime: '11:00' });
    const bookingId = createRes.body.id;
    await request(app)
      .delete(`/bookings/${bookingId}/cancel`)
      .set('Authorization', `Bearer ${token}`);
    const res = await request(app)
      .delete(`/bookings/${bookingId}/cancel`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('ALREADY_CANCELLED');
  });

  it('requires authentication', async () => {
    const res = await request(app).delete('/bookings/1/cancel');
    expect(res.status).toBe(401);
  });

  it('BR-8: allows cancellation made more than 1 hour before start time', async () => {
    const token = await registerAndLogin();
    // Book 2 days in future — comfortably within cut-off window
    const createRes = await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ courtId: 1, date: futureDate(2), startTime: '10:00', endTime: '11:00' });
    const res = await request(app)
      .delete(`/bookings/${createRes.body.id}/cancel`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Availability reflects cancellations — FR-2
// ---------------------------------------------------------------------------
describe('Availability reflects cancellations', () => {
  it('cancelled slot appears as free in availability', async () => {
    const token = await registerAndLogin();
    const date = futureDate(3);
    const createRes = await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ courtId: 1, date, startTime: '10:00', endTime: '11:00' });

    // Verify slot is booked
    const beforeCancel = await request(app).get(`/courts/1/availability?date=${date}`);
    expect(beforeCancel.body.bookedSlots).toHaveLength(1);

    // Cancel the booking
    await request(app)
      .delete(`/bookings/${createRes.body.id}/cancel`)
      .set('Authorization', `Bearer ${token}`);

    // Verify slot is now free
    const afterCancel = await request(app).get(`/courts/1/availability?date=${date}`);
    expect(afterCancel.body.bookedSlots).toHaveLength(0);
    expect(afterCancel.body.freeSlots).toHaveLength(1);
    expect(afterCancel.body.freeSlots[0]).toEqual({ startTime: '06:00', endTime: '22:00' });
  });
});
