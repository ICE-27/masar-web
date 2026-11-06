import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/send-otp   body: { phone }   header: Authorization: Bearer <user session>
 *
 * Asks the database for a one-time code *as the signed-in user* (so the
 * database's own rules apply: 30 s cooldown, 5 an hour),
 * then sends that code to the user's WhatsApp through Twilio.
 *
 * Nothing else can be sent through this route: the message text is fixed and
 * the code comes from the database, never from the browser.
 *
 * Twilio is optional. Without TWILIO_* env vars (or if sending fails) the
 * code is returned for the on-screen demo message, exactly as before.
 */
export async function POST(req: NextRequest) {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const auth = req.headers.get("authorization") ?? "";
  if (!url || !anon) return NextResponse.json({ message: "not_configured" }, { status: 501 });
  if (!/^Bearer\s+\S+$/.test(auth)) return NextResponse.json({ code: "P0001", message: "not_signed_in" }, { status: 401 });

  let phone = "";
  try {
    phone = String(((await req.json()) as { phone?: string }).phone ?? "");
  } catch {
    return NextResponse.json({ code: "P0001", message: "phone_invalid" }, { status: 400 });
  }
  if (!/^\+9665\d{8}$/.test(phone)) return NextResponse.json({ code: "P0001", message: "phone_invalid" }, { status: 400 });

  // 1. The code, from the database, with the database's limits
  const rpc = await fetch(`${url}/rest/v1/rpc/request_phone_otp`, {
    method: "POST",
    headers: { apikey: anon, Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({ p_phone: phone }),
    cache: "no-store",
  });
  const data = (await rpc.json().catch(() => ({}))) as {
    expires_at?: string;
    cooldown_seconds?: number;
    demo_code?: string | null;
    code?: string;
    message?: string;
    details?: string;
  };
  if (!rpc.ok) return NextResponse.json(data, { status: rpc.status });

  // 2. WhatsApp, when Twilio is configured
  const SID = process.env.TWILIO_ACCOUNT_SID;
  const TOKEN = process.env.TWILIO_AUTH_TOKEN;
  const FROM = process.env.TWILIO_WHATSAPP_FROM;
  let channel: "whatsapp" | "screen" = "screen";
  if (SID && TOKEN && FROM && data.demo_code) {
    try {
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: "Basic " + Buffer.from(`${SID}:${TOKEN}`).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          From: `whatsapp:${FROM}`,
          To: `whatsapp:${phone}`,
          Body: `رمز التحقق من مسار: ${data.demo_code}\nYour Masar verification code: ${data.demo_code}`,
        }).toString(),
      });
      if (res.ok) channel = "whatsapp";
      else console.error("Twilio:", res.status, await res.text().catch(() => ""));
    } catch (e) {
      console.error("Twilio:", e);
    }
  }

  return NextResponse.json({
    expires_at: data.expires_at,
    cooldown_seconds: data.cooldown_seconds,
    // Demo mode still shows the code: the Twilio sandbox only delivers to numbers that joined it
    demo_code: data.demo_code ?? null,
    channel,
  });
}
