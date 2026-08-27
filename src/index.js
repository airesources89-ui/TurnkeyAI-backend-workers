// ════════════════════════════════════════════════
// ── src/index.js — Stage 1: Foundation
// ── Switched from Express to Hono: Express has a
// ── confirmed, unfixed bug in Cloudflare's build tool
// ── that triggers just from importing it. Hono is the
// ── framework Cloudflare itself recommends for Workers
// ── and has no such issue.
// ════════════════════════════════════════════════
import { Hono } from "hono";
import { Client } from "pg";

const app = new Hono();

app.get("/health", (c) => {
  return c.json({ status: "ok", stage: "workers-foundation" });
});

app.get("/db-test", async (c) => {
  const client = new Client({ connectionString: c.env.HYPERDRIVE.connectionString });
  try {
    await client.connect();

    const tables = await client.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
    );

    let clientCount = null;
    try {
      const countResult = await client.query(`SELECT COUNT(*) AS count FROM clients`);
      clientCount = countResult.rows[0].count;
    } catch (_) {}

    return c.json({
      status: "connected",
      tables: tables.rows.map((r) => r.table_name),
      clientCount,
    });
  } catch (err) {
    return c.json({ status: "error", message: String(err) }, 500);
  } finally {
    await client.end();
  }
});

export default app;
