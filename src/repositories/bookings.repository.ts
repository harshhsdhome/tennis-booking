import { Pool, PoolClient } from 'pg';
import { pool } from '../db/pool';
import { Booking, BookingStatus, BookingWithCourt } from '../types/models';

function mapBooking(row: Record<string, unknown>): Booking {
  return {
    id: row['id'] as number,
    userId: row['user_id'] as number,
    courtId: row['court_id'] as number,
    date: row['date'] as string,
    startTime: row['start_time'] as string,
    endTime: row['end_time'] as string,
    status: row['status'] as BookingStatus,
    createdAt: row['created_at'] as Date,
  };
}

function mapBookingWithCourt(row: Record<string, unknown>): BookingWithCourt {
  return { ...mapBooking(row), courtName: row['court_name'] as string };
}

/** Count active bookings for user on a specific date. BR-5 */
export async function countActiveBookingsForUserOnDate(
  client: PoolClient,
  userId: number,
  date: string
): Promise<number> {
  const { rows } = await client.query(
    `SELECT COUNT(*) AS cnt FROM bookings
     WHERE user_id = $1 AND date = $2 AND status = 'active'`,
    [userId, date]
  );
  return parseInt(rows[0]['cnt'], 10);
}

/** Count active future bookings for user. BR-6 */
export async function countActiveFutureBookingsForUser(
  client: PoolClient,
  userId: number,
  nowDate: string,
  nowTime: string
): Promise<number> {
  const { rows } = await client.query(
    `SELECT COUNT(*) AS cnt FROM bookings
     WHERE user_id = $1
       AND status = 'active'
       AND (date > $2 OR (date = $2 AND start_time > $3))`,
    [userId, nowDate, nowTime]
  );
  return parseInt(rows[0]['cnt'], 10);
}

/** Check for overlapping active bookings on the same court+date. BR-4 */
export async function getOverlappingBookings(
  client: PoolClient,
  courtId: number,
  date: string,
  startTime: string,
  endTime: string
): Promise<Booking[]> {
  const { rows } = await client.query(
    `SELECT * FROM bookings
     WHERE court_id = $1
       AND date = $2
       AND status = 'active'
       AND start_time < $4
       AND end_time   > $3`,
    [courtId, date, startTime, endTime]
  );
  return rows.map(mapBooking);
}

/** Insert a new booking and return the created record. */
export async function insertBooking(
  client: PoolClient,
  userId: number,
  courtId: number,
  date: string,
  startTime: string,
  endTime: string
): Promise<Booking> {
  const { rows } = await client.query(
    `INSERT INTO bookings (user_id, court_id, date, start_time, end_time, status)
     VALUES ($1, $2, $3, $4, $5, 'active')
     RETURNING *`,
    [userId, courtId, date, startTime, endTime]
  );
  return mapBooking(rows[0]);
}

/** Batch-update booking statuses. Used for lazy completion. */
export async function updateBookingStatusBatch(
  ids: number[],
  status: BookingStatus,
  db: Pool | PoolClient = pool
): Promise<void> {
  if (ids.length === 0) return;
  await db.query(
    `UPDATE bookings SET status = $1 WHERE id = ANY($2::int[]) AND status = 'active'`,
    [status, ids]
  );
}

/** Fetch all bookings for a user, joined with court name. FR-4 */
export async function getBookingsForUser(userId: number, db: Pool = pool): Promise<BookingWithCourt[]> {
  const { rows } = await db.query(
    `SELECT b.*, c.name AS court_name
     FROM bookings b
     JOIN courts c ON c.id = b.court_id
     WHERE b.user_id = $1
     ORDER BY b.date ASC, b.start_time ASC`,
    [userId]
  );
  return rows.map(mapBookingWithCourt);
}

/** Find a single booking by id. */
export async function findBookingById(id: number, db: Pool = pool): Promise<Booking | null> {
  const { rows } = await db.query('SELECT * FROM bookings WHERE id = $1', [id]);
  return rows.length > 0 ? mapBooking(rows[0]) : null;
}

/** Update a single booking's status. */
export async function updateBookingStatus(
  id: number,
  status: BookingStatus,
  db: Pool = pool
): Promise<Booking> {
  const { rows } = await db.query(
    `UPDATE bookings SET status = $1 WHERE id = $2 RETURNING *`,
    [status, id]
  );
  return mapBooking(rows[0]);
}
