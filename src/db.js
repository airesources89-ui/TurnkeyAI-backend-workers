// ════════════════════════════════════════════════
// ── src/db.js — Database helper (Workers version)
// ── Difference from the old Railway lib/db.js:
// ── the old version kept ONE database connection open
// ── forever, and cached every client's data in memory
// ── the whole time the server was running. Workers don't
// ── run "the whole time" — each request is brief and
// ── separate — so instead we open a fast connection
// ── (via Hyperdrive) for each request and look up
// ── exactly what's needed, live, every time.
// ════════════════════════════════════════════════
import { Client } from "pg";

// Call this once at the top of a request, use it, then always call
// closeDb() when done (in a try/finally) so the connection is released.
export function getDb(env) {
  return new Client({ connectionString: env.HYPERDRIVE.connectionString });
}

export async function closeDb(client) {
  try {
    await client.end();
  } catch (_) {
    // already closed — safe to ignore
  }
}

// ── Look up one client's stored data by its id ──
export async function getClientById(db, id) {
  const result = await db.query(`SELECT * FROM clients WHERE id = $1`, [id]);
  return result.rows[0] || null;
}

// ── Look up several clients' business names at once, by id ──
// Returns a plain object: { clientId: businessName }
export async function getBusinessNamesByIds(db, ids) {
  if (!ids.length) return {};
  const result = await db.query(
    `SELECT id, data->>'businessName' AS business_name FROM clients WHERE id = ANY($1::text[])`,
    [ids]
  );
  const map = {};
  for (const row of result.rows) map[row.id] = row.business_name;
  return map;
}

// ── Check whether a client id actually exists (used to validate
// ── incoming analytics events before logging them) ──
export async function clientExists(db, id) {
  const result = await db.query(`SELECT 1 FROM clients WHERE id = $1`, [id]);
  return result.rowCount > 0;
}

