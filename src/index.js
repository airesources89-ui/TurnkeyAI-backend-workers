// ════════════════════════════════════════════════
// ── src/index.js — Stage 1: Foundation
// ── Goal of this file: prove the app boots on Cloudflare
// ── Workers, and that it can talk to the Neon database
// ── through Hyperdrive. Nothing else yet — the real
// ── routes (intake, admin, chat, etc.) get ported in
// ── later stages once this foundation is confirmed working.
// ════════════════════════════════════════════════
import { env } from "cloudflare:workers";
import { httpServerHandler } from "cloudflare:node";
import express from "express";
import { Client } from "pg";

const app = express();
app.use(express.json({ limit: "50mb" }));

// ── Health check — same shape as the old Railway /health route ──
app.get("/health", (req, res) => {
  res.json({ status: "ok", stage: "workers-foundation" });
});

// ── Database test route — proves Hyperdrive -> Neon works ──
app.get("/db-test", async (req, res) => {
  const client = new Client({ connectionString: env.HYPERDRIVE.connectionString });
  try {
    await client.connect();

    const tables = await client.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
    );

    let clientCount = null;
    try {
      const countResult = await client.query(`SELECT COUNT(*) AS count FROM clients`);
      clientCount = countResult.rows[0].count;
    } catch (_) {
      // "clients" table might not exist under this exact name — that's fine,
      // the table list above still proves the connection works.
    }

    res.json({
      status: "connected",
      tables: tables.rows.map((r) => r.table_name),
      clientCount,
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: String(err) });
  } finally {
    await client.end();
  }
});

app.listen(3000);
export default httpServerHandler({ port: 3000 });
