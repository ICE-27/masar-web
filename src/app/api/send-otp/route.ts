import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/send-otp
 * Sends the OTP code via WhatsApp (Twilio sandbox).
 *
 * Body: { phone: string; code: string }
 *
 * The three TWILIO_* env vars must be set on the server (NOT NEXT_PUBLIC_).
 * If they aren't set, the endpoint returns { sent: false } so the client
 * can fall back to showing the demo code on screen.
 */
export async function POST(req: NextRequest) {
  const SID = process.env.TWILIO_ACCOUNT_SID;
  const TOKEN = process.env.TWILIO_AUTH_TOKEN;
  const FROM = process.env.TWILIO_WHATSAPP_FROM; // e.g. +17372508034

  if (!SID || !TOKEN || !FROM) {
    return NextResponse.json({ sent: false, reason: "twilio_not_configured" });
  }

  let body: { phone?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ sent: false, reason: "invalid_body" }, { status: 400 });
  }

  const { phone, code } = body;
  if (!phone || !code) {
    return NextResponse.json({ sent: false, reason: "missing_fields" }, { status: 400 });
  }

  // Twilio WhatsApp sandbox: numbers must be in E.164 format
  // Saudi numbers: 05XXXXXXXX → +9665XXXXXXXX
  const e164 = phone.startsWith("+") ? phone : `+966${phone.replace(/^0/, "")}`;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`;

  const params = new URLSearchParams({
    From: `whatsapp:${FROM}`,
    To: `whatsapp:${e164}`,
    Body: `Your Masar verification code is: ${code}\n\nرمز التحقق من مسار: ${code}`,
  });

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${SID}:${TOKEN}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error("Twilio error:", err);
      return NextResponse.json({ sent: false, reason: "twilio_error", detail: err.message });
    }

    return NextResponse.json({ sent: true });
  } catch (e) {
    console.error("Twilio fetch error:", e);
    return NextResponse.json({ sent: false, reason: "network_error" });
  }
}
