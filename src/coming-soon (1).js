// ════════════════════════════════════════════════
// ── src/routes/coming-soon.js — Feature ratings + email capture
// ── Ported from routes/coming-soon.js (Railway version).
// ── FIX included: the original code called a function
// ── (saveComingSoonLead) that was never actually written
// ── anywhere — meaning every email submission on the live
// ── site has been silently failing. This version actually
// ── saves the lead to a real table (coming_soon_leads).
// ════════════════════════════════════════════════
import { Hono } from "hono";
import { getDb, closeDb } from "../db.js";
import { sendEmail, ADMIN_EMAIL } from "../email.js";

const comingSoon = new Hono();

// ── POST /api/coming-soon/rate — per-star click ──
comingSoon.post("/api/coming-soon/rate", async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch (_) {
    return c.json({ ok: false }, 400);
  }

  const { featureId, rating } = body || {};
  if (!featureId || !rating || rating < 1 || rating > 5) {
    return c.json({ ok: false }, 400);
  }

  const db = getDb(c.env);
  try {
    await db.connect();
    await db.query(
      `UPDATE coming_soon_features
       SET rating_sum = rating_sum + $1, total_ratings = total_ratings + 1
       WHERE id = $2`,
      [Math.round(rating), featureId]
    );
    return c.json({ ok: true });
  } catch (err) {
    console.error("[coming-soon/rate]", err.message);
    // Matches original behavior: never fail loudly on a rating click
    return c.json({ ok: true });
  } finally {
    await closeDb(db);
  }
});

// ── POST /api/coming-soon/submit — email capture + full rating set ──
comingSoon.post("/api/coming-soon/submit", async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch (_) {
    return c.json({ ok: false, error: "Invalid request." }, 400);
  }

  const { email, ratings } = body || {};

  if (!email || typeof email !== "string") {
    return c.json({ ok: false, error: "Email is required." }, 400);
  }
  const emailClean = email.toLowerCase().trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(emailClean)) {
    return c.json({ ok: false, error: "Please enter a valid email address." }, 400);
  }

  const ratingsClean = {};
  if (ratings && typeof ratings === "object") {
    for (const [key, val] of Object.entries(ratings)) {
      const n = parseInt(val);
      if (n >= 1 && n <= 5) ratingsClean[key] = n;
    }
  }
  if (Object.keys(ratingsClean).length === 0) {
    return c.json({ ok: false, error: "Please rate at least one feature." }, 400);
  }

  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const db = getDb(c.env);
  try {
    await db.connect();

    // ── Real lead-saving logic (this table + insert never existed before) ──
    const insertResult = await db.query(
      `INSERT INTO coming_soon_leads (email, ratings, ip_address)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO NOTHING
       RETURNING id`,
      [emailClean, JSON.stringify(ratingsClean), ip]
    );
    const saved = insertResult.rowCount > 0;

    if (!saved) {
      return c.json({ ok: true, duplicate: true });
    }

    const topFeatureId = Object.entries(ratingsClean).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
    let topFeatureName = "your top feature";
    if (topFeatureId) {
      const featureRow = await db.query(`SELECT name FROM coming_soon_features WHERE id = $1`, [
        topFeatureId,
      ]);
      topFeatureName = featureRow.rows[0]?.name || topFeatureName;
    }

    const html = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:linear-gradient(135deg,#f59e0b,#e85d04);padding:24px 32px;border-radius:12px 12px 0 0;">
          <h1 style="color:white;margin:0;font-size:20px;">🎯 New Coming Soon Lead</h1>
          <p style="color:rgba(255,255,255,0.9);margin:6px 0 0;font-size:14px;">Someone claimed their free first year</p>
        </div>
        <div style="padding:28px 32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
          <p><strong>Email:</strong> <a href="mailto:${emailClean}">${emailClean}</a></p>
          <p><strong>Top-rated feature:</strong> ${topFeatureName}</p>
          <p><strong>Ratings submitted:</strong></p>
          <ul style="margin:8px 0 16px 20px;line-height:1.8;">
            ${Object.entries(ratingsClean)
              .map(([k, v]) => `<li>${k}: ${"★".repeat(v)}${"☆".repeat(5 - v)}</li>`)
              .join("")}
          </ul>
          <p style="font-size:13px;color:#6B7280;margin-top:20px;">Submitted ${new Date().toLocaleString(
            "en-US",
            { timeZone: "America/Chicago" }
          )} CT</p>
        </div>
      </div>`;

    c.executionCtx.waitUntil(
      sendEmail(c.env, {
        to: ADMIN_EMAIL,
        subject: `🎯 Coming Soon Lead — ${emailClean}`,
        html,
      }).catch((e) => console.error("[coming-soon email to admin]", e.message))
    );

    return c.json({ ok: true });
  } catch (err) {
    console.error("[coming-soon/submit]", err.message);
    return c.json({ ok: false, error: "Something went wrong. Please try again." }, 500);
  } finally {
    await closeDb(db);
  }
});

export default comingSoon;
