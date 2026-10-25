import { Pool, PoolClient } from 'pg';
import { pool } from '../db/pool';
import { Court, Booking, BookingStatus } from '../types/models';

function mapCourt(row: Record<string, unknown>): Court {
  return { id: row['id'] as number, name: row['name'] as string };
}

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

export async function getAllCourts(db: Pool = pool): Promise<Court[]> {
  const { rows } = await db.query('SELECT * FROM courts ORDER BY id');
  return rows.map(mapCourt);
}

export async function findCourtById(id: number, db: Pool = pool): Promise<Court | null> {
  const { rows } = await db.query('SELECT * FROM courts WHERE id = $1', [id]);
  return rows.length > 0 ? mapCourt(rows[0]) : null;
}

export async function getActiveBookingsForCourtOnDate(
  courtId: number,
  date: string,
  db: Pool | PoolClient = pool
): Promise<Booking[]> {
  const { rows } = await db.query(
    `SELECT * FROM bookings
     WHERE court_id = $1
       AND date = $2
       AND status = 'active'`,
    [courtId, date]
  );
  return rows.map(mapBooking);
}

export { mapBooking };
