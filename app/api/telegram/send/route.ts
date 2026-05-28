// app/api/telegram/send/route.ts
// POST /api/telegram/send
// Body: { message: string }
// Thin server-side wrapper around sendTelegram so the browser can fire alerts
// without exposing the bot token. Used by the Promosi page's expiry-check
// button; reusable from anywhere on the client.
import { NextRequest, NextResponse } from "next/server";
import { sendTelegram } from "@/lib/telegram";

export async function POST(req: NextRequest) {
  try {
    const { message } = (await req.json()) as { message?: string };
    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "message wajib" }, { status: 400 });
    }
    const ok = await sendTelegram(message);
    return NextResponse.json({ ok });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
