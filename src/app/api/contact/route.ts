import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/contact   body: { name, phone, email, topic, message, website }
 *
 * Forwards the contact form to Masar's inbox by email. The recipient address
 * stays on the server; the browser never sees it.
 *
 * Delivery:
 *   - RESEND_API_KEY set  → Resend (onboarding@resend.dev can send to the
 *     address that owns the Resend account, no domain setup needed)
 *   - otherwise           → FormSubmit (no key; the very first message sends
 *     an "Activate" email to the inbox — click it once and you're done)
 */

const TO = process.env.CONTACT_EMAIL || "abdullah.althaqib1@gmail.com";

// Best-effort flood protection per server instance
const recent = new Map<string, number[]>();
function tooMany(ip: string) {
  const now = Date.now();
  const list = (recent.get(ip) ?? []).filter((t) => now - t < 10 * 60 * 1000);
  list.push(now);
  recent.set(ip, list);
  return list.length > 5;
}

const clean = (v: unknown, max: number) =>
  String(v ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .trim()
    .slice(0, max);

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  // Bots fill the hidden field; pretend it worked
  if (clean(body.website, 200)) return NextResponse.json({ ok: true });

  const name = clean(body.name, 80);
  const phone = clean(body.phone, 20).replace(/\s/g, "");
  const email = clean(body.email, 120);
  const topic = clean(body.topic, 80);
  const message = clean(body.message, 3000);
  if (name.length < 2 || !/^\S+@\S+\.\S+$/.test(email) || !/^0\d{9}$/.test(phone) || message.length < 2) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  if (tooMany(ip)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const subject = `Masar contact: ${topic || "Message"} — ${name}`;
  const text = [`Name: ${name}`, `Mobile: ${phone}`, `Email: ${email}`, `Topic: ${topic || "-"}`, "", message].join("\n");

  try {
    const key = process.env.RESEND_API_KEY;
    const res = key
      ? await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: process.env.CONTACT_FROM || "Masar <onboarding@resend.dev>",
            to: [TO],
            reply_to: email,
            subject,
            text,
          }),
        })
      : await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(TO)}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            // FormSubmit expects a web page as the sender
            Origin: "https://www.ksamasar.com",
            Referer: "https://www.ksamasar.com/contact",
          },
          body: JSON.stringify({
            _subject: subject,
            _replyto: email,
            _template: "table",
            _captcha: "false",
            name,
            mobile: phone,
            email,
            topic: topic || "-",
            message,
          }),
        });
    const raw = await res.text().catch(() => "");
    if (!res.ok) {
      console.error("contact:", res.status, raw);
      return NextResponse.json({ error: "send_failed" }, { status: 502 });
    }
    if (!key) {
      // FormSubmit answers 200 even on failure; the body says what happened
      let r: { success?: string | boolean; message?: string } = {};
      try {
        r = JSON.parse(raw);
      } catch {}
      if (String(r.success) !== "true") {
        console.error("contact (FormSubmit):", r.message ?? raw);
        // The first message triggers FormSubmit's one-time "Activate" email
        if (!/activat/i.test(r.message ?? "")) return NextResponse.json({ error: "send_failed" }, { status: 502 });
      }
    }
  } catch (e) {
    console.error("contact:", e);
    return NextResponse.json({ error: "send_failed" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
