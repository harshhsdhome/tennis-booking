import request from 'supertest';
import app from '../../src/server';
import { pool } from '../../src/db/pool';

afterAll(async () => {
  await pool.end();
});

// ---------------------------------------------------------------------------
// GET /courts — FR-1
// ---------------------------------------------------------------------------
describe('GET /courts', () => {
  it('returns 200 with 3 seeded courts', async () => {
    const res = await request(app).get('/courts');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(3);
    const names = res.body.map((c: { name: string }) => c.name);
    expect(names).toContain('Court 1');
    expect(names).toContain('Court 2');
    expect(names).toContain('Court 3');
  });

  it('each court has id and name', async () => {
    const res = await request(app).get('/courts');
    for (const court of res.body) {
      expect(court.id).toBeDefined();
      expect(court.name).toBeDefined();
    }
  });

  it('is public — no auth required', async () => {
    const res = await request(app).get('/courts');
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// GET /courts/:id/availability — FR-2
// ---------------------------------------------------------------------------
describe('GET /courts/:id/availability', () => {
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  it('returns freeSlots and bookedSlots for a date with no bookings', async () => {
    const res = await request(app).get(`/courts/1/availability?date=${tomorrow}`);
    expect(res.status).toBe(200);
    expect(res.body.freeSlots).toBeDefined();
    expect(res.body.bookedSlots).toBeDefined();
    expect(res.body.freeSlots).toHaveLength(1);
    expect(res.body.freeSlots[0]).toEqual({ startTime: '06:00', endTime: '22:00' });
    expect(res.body.bookedSlots).toHaveLength(0);
  });

  it('returns 400 when date is missing', async () => {
    const res = await request(app).get('/courts/1/availability');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for invalid date formats', async () => {
    for (const date of ['today', '15/03/2025', '2025-02-30', '2025-13-01']) {
      const res = await request(app).get(`/courts/1/availability?date=${date}`);
      expect(res.status).toBe(400);
    }
  });

  it('returns 404 for unknown court id', async () => {
    const res = await request(app).get(`/courts/999/availability?date=${tomorrow}`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('COURT_NOT_FOUND');
  });

  it('is public — no auth required', async () => {
    const res = await request(app).get(`/courts/1/availability?date=${tomorrow}`);
    expect(res.status).toBe(200);
  });
});
