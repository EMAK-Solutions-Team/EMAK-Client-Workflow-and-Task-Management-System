import fs from 'fs';
import path from 'path';
import { pool } from './db';

async function applySchema() {
  const schema = fs.readFileSync(path.resolve(__dirname, '../schema.sql'), 'utf8');
  await pool.query(schema);
  console.log('Database schema applied successfully.');
}

applySchema()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
