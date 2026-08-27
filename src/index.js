// ════════════════════════════════════════════════
// ── src/index.js — Stage 1: Foundation
// ── Note: this does NOT use express.json() — that
// ── feature pulls in a package with a confirmed,
// ── unfixed bug in Cloudflare's build tool. We'll add
// ── a safe replacement for reading JSON request bodies
// ── in a later stage, once forms need it.
// ════════════════════════════════════════════════
import { env } from "cloudflare:workers";
import { httpServerHandler } from "cloudflare:node";
import express from "express";
import { Client } from "pg";

const app = express();

app.get("/health", (req, res) => {
  res.json({ status: "ok", stage: "workers-foundation" });
});

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
    } catch (_) {}

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
