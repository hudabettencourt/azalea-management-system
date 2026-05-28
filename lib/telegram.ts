// lib/telegram.ts
// Sends Telegram messages via Bot API. Used for Shopee event notifications
// (new orders, ship confirmations, returns, payouts, voucher expiry).
// Failures are swallowed and logged — never let a notification break the
// caller's primary flow.

type TelegramOpts = {
  parseMode?: "HTML" | "Markdown" | "MarkdownV2";
  disablePreview?: boolean;
  silent?: boolean;
};

export async function sendTelegram(message: string, opts: TelegramOpts = {}): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.warn("[telegram] missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID");
    return false;
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: opts.parseMode ?? "HTML",
        disable_web_page_preview: opts.disablePreview ?? true,
        disable_notification: opts.silent ?? false,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "<no body>");
      console.error(`[telegram] ${res.status} ${res.statusText}: ${body}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[telegram] send failed:", err);
    return false;
  }
}

// Escape HTML special chars for safe inclusion in HTML-mode messages.
export function tgEscape(s: string | null | undefined): string {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function formatRupiah(n: number): string {
  return `Rp ${Math.round(n || 0).toLocaleString("id-ID")}`;
}
