// ════════════════════════════════════════════════
// ── src/email.js — Email sending (Workers version)
// ── Switched from SendGrid to Brevo: SendGrid was
// ── already cancelled on the Railway account, but
// ── Brevo is still active with a working API key.
// ── Brevo's API is a plain HTTP call, so it works on
// ── Cloudflare Workers with no extra libraries needed.
// ════════════════════════════════════════════════

const ADMIN_EMAIL = "turnkeyaiservices@gmail.com";

export async function sendEmail(env, { to, subject, html }) {
  if (!env.BREVO_API_KEY) {
    console.warn("[email] No BREVO_API_KEY set — email not sent");
    return;
  }
  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": env.BREVO_API_KEY,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sender: { email: ADMIN_EMAIL, name: "TurnkeyAI Services" },
        to: [{ email: to }],
        subject,
        htmlContent: html,
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error("[Brevo error]", res.status, errText);
    }
  } catch (e) {
    console.error("[sendEmail exception]", e.message);
  }
}

export { ADMIN_EMAIL };
