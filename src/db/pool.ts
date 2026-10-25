import { Pool, types } from 'pg';
import { config } from '../config';

// Return DATE columns as plain strings (YYYY-MM-DD) instead of JS Date objects.
// This avoids timezone shifting when the server is not UTC. (SD-2)
types.setTypeParser(1082, (val: string) => val);

export const pool = new Pool({
  connectionString: config.databaseUrl,
});
