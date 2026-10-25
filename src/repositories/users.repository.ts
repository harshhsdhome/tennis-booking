import { Pool } from 'pg';
import { pool } from '../db/pool';
import { User } from '../types/models';

function mapRow(row: Record<string, unknown>): User {
  return {
    id: row['id'] as number,
    email: row['email'] as string,
    name: row['name'] as string,
    password: row['password'] as string,
    createdAt: row['created_at'] as Date,
  };
}

export async function findUserByEmail(email: string, db: Pool = pool): Promise<User | null> {
  const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [email]);
  return rows.length > 0 ? mapRow(rows[0]) : null;
}

export async function createUser(
  email: string,
  name: string,
  hashedPassword: string,
  db: Pool = pool
): Promise<User> {
  const { rows } = await db.query(
    'INSERT INTO users (email, name, password) VALUES ($1, $2, $3) RETURNING *',
    [email, name, hashedPassword]
  );
  return mapRow(rows[0]);
}
