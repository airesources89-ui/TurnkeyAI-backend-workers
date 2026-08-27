// ════════════════════════════════════════════════
// ── src/index.js — Main app entry
// ── Stage 3: added the "Coming Soon" feature routes
// ── (ratings + email capture — with a real fix for a
// ── bug that was silently breaking lead capture on live).
// ════════════════════════════════════════════════
import { Hono } from "hono";
import { Client } from "pg";
import analytics from "./routes/analytics.js";
import comingSoon from "./routes/coming-soon.js";

const app = new Hono();

app.get("/health", (c) => {
  return c.json({ status: "ok", stage: "stage-3-coming-soon" });
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

app.route("/", analytics);
app.route("/", comingSoon);

export default app;
