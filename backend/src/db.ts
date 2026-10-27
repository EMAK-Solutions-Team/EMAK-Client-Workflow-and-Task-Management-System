import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { UserRecord } from './types';

dotenv.config();

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : undefined
});

const SEED_USERS: UserRecord[] = [
  {
    id: 1,
    name: 'Kasper Luboinski',
    email: 'manager@emak.ca',
    password_hash: bcrypt.hashSync('manager123', 10),
    role: 'Manager'
  },
  {
    id: 2,
    name: 'Mehak Gill',
    email: 'member@emak.ca',
    password_hash: bcrypt.hashSync('member123', 10),
    role: 'Team Member'
  },
  {
    id: 3,
    name: 'Emilio Conde',
    email: 'client@emak.ca',
    password_hash: bcrypt.hashSync('client123', 10),
    role: 'Client'
  }
];

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  const normalized = email.trim().toLowerCase();

  if (process.env.DATABASE_URL) {
    try {
      const result = await pool.query<UserRecord>(
        'SELECT id, name, email, password_hash, role FROM users WHERE LOWER(email) = $1 LIMIT 1',
        [normalized]
      );
      return result.rows[0] || null;
    } catch (err) {
      console.warn('Database connection fallback:', err);
    }
  }

  const found = SEED_USERS.find((u) => u.email.toLowerCase() === normalized);
  return found || null;
}