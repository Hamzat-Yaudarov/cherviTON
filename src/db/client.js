import pkg from 'pg';
const { Pool } = pkg;

let pool;

function normalizeConnection(conn){
  if(!conn) return null;
  // If string contains "postgresql://" return substring from there
  const idx = conn.indexOf('postgresql://');
  if(idx>=0) return conn.slice(idx);
  // remove leading "psql '" or similar
  return conn.replace(/^psql\s+/, '').replace(/^'+|'+$/g,'');
}

export async function initDb(){
  const raw = process.env.NEON_CONNECTION || process.env.NEON || process.env.DATABASE_URL;
  const connString = normalizeConnection(raw || '');
  pool = new Pool({ connectionString: connString });
  // create tables
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id bigserial PRIMARY KEY,
      username text UNIQUE NOT NULL,
      balance numeric DEFAULT 0,
      created_at timestamptz DEFAULT now()
    );
  `);
}

export async function createUserIfNotExists(username){
  if(!pool) await initDb();
  const res = await pool.query('SELECT * FROM users WHERE username=$1', [username]);
  if(res.rows[0]) return res.rows[0];
  const insert = await pool.query('INSERT INTO users (username, balance) VALUES ($1, $2) RETURNING *', [username, 0]);
  return insert.rows[0];
}

export async function getUserByUsername(username){
  if(!pool) await initDb();
  const res = await pool.query('SELECT * FROM users WHERE username=$1', [username]);
  return res.rows[0] || null;
}

export async function updateUserBalance(username, delta){
  if(!pool) await initDb();
  // atomic update
  const res = await pool.query(`UPDATE users SET balance = balance + $1 WHERE username=$2 RETURNING *`, [delta, username]);
  if(res.rows[0]) return res.rows[0];
  // if user not exists create with delta
  const created = await pool.query('INSERT INTO users (username, balance) VALUES ($1, $2) RETURNING *', [username, delta]);
  return created.rows[0];
}

export async function transferBalance(fromUser, toUser, amount){
  if(!pool) await initDb();
  // use a transaction
  const client = await pool.connect();
  try{
    await client.query('BEGIN');
    const from = await client.query('SELECT balance FROM users WHERE username=$1 FOR UPDATE', [fromUser]);
    if(!from.rows[0] || Number(from.rows[0].balance) < amount){
      await client.query('ROLLBACK');
      throw new Error('insufficient funds');
    }
    await client.query('UPDATE users SET balance = balance - $1 WHERE username=$2', [amount, fromUser]);
    await client.query('UPDATE users SET balance = balance + $1 WHERE username=$2', [amount, toUser]);
    await client.query('COMMIT');
    return true;
  }catch(err){
    await client.query('ROLLBACK');
    throw err;
  }finally{client.release();}
}
