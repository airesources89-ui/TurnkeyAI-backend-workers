// ════════════════════════════════════════════════
// ── src/routes/analytics.js — Analytics tracking and reporting
// ── Ported from routes/analytics.js (Railway version).
// ── Behavior is the same as before:
// ──   POST /api/track/pageview  — logs a pageview (public)
// ──   GET  /api/admin/analytics — aggregated report (admin only)
// ════════════════════════════════════════════════
import { Hono } from "hono";
import { getDb, closeDb, getBusinessNamesByIds, clientExists } from "../db.js";

const analytics = new Hono();

// ── POST /api/track/pageview — Public analytics tracking endpoint ──
analytics.post("/api/track/pageview", async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch (_) {
    return c.json({ ok: false }, 400);
  }

  const { clientId, page, referrer } = body || {};
  if (!clientId) return c.json({ ok: false }, 400);

  const db = getDb(c.env);
  try {
    await db.connect();

    if (clientId !== "turnkeyai_marketing") {
      const exists = await clientExists(db, clientId);
      if (!exists) return c.json({ ok: false }, 400);
    }

    // This write doesn't need to finish before we respond to the visitor,
    // but it DOES need to actually finish before the Worker shuts down —
    // waitUntil() tells Cloudflare to keep this request alive until it's done.
    c.executionCtx.waitUntil(
      db
        .query(
          `INSERT INTO analytics_events (client_id, event_type, source, metadata) VALUES ($1, 'pageview', $2, $3)`,
          [clientId, page || null, referrer ? JSON.stringify({ referrer }) : null]
        )
        .catch((e) => console.error("[analytics]", e.message))
        .finally(() => closeDb(db))
    );

    return c.json({ ok: true });
  } catch (err) {
    console.error("[/api/track/pageview]", err);
    await closeDb(db);
    // Matches the original behavior: never fail loudly on tracking errors
    return c.json({ ok: true });
  }
});

// ── GET /api/admin/analytics — Aggregated per-client analytics ──
analytics.get("/api/admin/analytics", async (c) => {
  const adminKey = c.req.query("adminKey") || c.req.header("x-admin-key");
  if (adminKey !== c.env.ADMIN_KEY) {
    return c.json({ error: "Unauthorized" }, 403);
  }

  const days = parseInt(c.req.query("days")) || 30;
  const db = getDb(c.env);
  try {
    await db.connect();

    const dateFilter =
      days > 0 && days < 9999 ? `WHERE created_at >= NOW() - ($1 || ' days')::interval` : "";
    const params = dateFilter ? [days] : [];

    const result = await db.query(
      `
      SELECT client_id,
             COUNT(*) FILTER (WHERE event_type = 'pageview') AS pageviews,
             COUNT(*) FILTER (WHERE event_type = 'chat') AS chats,
             COUNT(*) FILTER (WHERE event_type = 'booking') AS bookings,
             COUNT(*) FILTER (WHERE event_type = 'call') AS calls,
             COUNT(*) FILTER (WHERE event_type = 'sms') AS sms
      FROM analytics_events
      ${dateFilter}
      GROUP BY client_id
      ORDER BY COUNT(*) DESC
      `,
      params
    );

    const clientIds = result.rows.map((r) => r.client_id).filter((id) => id !== "turnkeyai_marketing");
    const businessNames = await getBusinessNamesByIds(db, clientIds);

    const analyticsRows = result.rows.map((row) => ({
      clientId: row.client_id,
      businessName:
        row.client_id === "turnkeyai_marketing"
          ? "TurnkeyAI Website"
          : businessNames[row.client_id] || row.client_id,
      pageviews: parseInt(row.pageviews) || 0,
      chats: parseInt(row.chats) || 0,
      bookings: parseInt(row.bookings) || 0,
      calls: parseInt(row.calls) || 0,
      sms: parseInt(row.sms) || 0,
    }));

    return c.json({ analytics: analyticsRows, days });
  } catch (err) {
    console.error("[/api/admin/analytics]", err);
    return c.json({ error: "Failed to load analytics" }, 500);
  } finally {
    await closeDb(db);
  }
});

export default analytics;

