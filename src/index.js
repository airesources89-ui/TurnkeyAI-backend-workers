// ════════════════════════════════════════════════
// ── src/index.js — Main app entry
// ── Stage 2: added the analytics routes (first real
// ── feature ported over) on top of the Stage 1 foundation.
// ════════════════════════════════════════════════
import { Hono } from "hono";
import { Client } from "pg";
import analytics from "./routes/analytics.js";

const app = new Hono();

app.get("/health", (c) => {
  return c.json({ status: "ok", stage: "stage-2-analytics" });
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

// ── Mount the analytics routes ──
app.route("/", analytics);

export default app;
