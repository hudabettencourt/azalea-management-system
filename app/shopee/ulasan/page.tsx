"use client";

// /shopee/ulasan — Reviews + reply.
// Tugas 9 (urutan): fetch get_rating per toko, filter toko/star/replied,
// per-review card with sensored buyer name, inline reply form.

import { useCallback, useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { useTheme, LIGHT, DARK } from "@/context/ThemeContext";

type Review = {
  key: string;            // toko_id + comment_id
  toko_id: number;
  toko_nama: string;
  comment_id: number;
  rating_star: number;
  comment: string;
  buyer: string;
  create_time: number;
  order_sn: string;
  item_id: number | null;
  item_name: string;
  image_url: string | null;
  replied: boolean;
  reply_text: string;
  raw: any;
};

function sensorName(s: string): string {
  if (!s) return "—";
  const str = String(s);
  if (str.length <= 3) return str[0] + "**";
  const head = str.slice(0, Math.max(2, Math.floor(str.length * 0.35)));
  const tail = str.slice(-2);
  return `${head}***${tail}`;
}

function unixToWIB(unix: number): string {
  if (!unix) return "-";
  return new Date(unix * 1000).toLocaleString("id-ID", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta",
  });
}

function parseReview(toko_id: number, toko_nama: string, raw: any): Review {
  const cid = Number(raw?.comment_id ?? raw?.ratingid ?? raw?.id ?? 0);
  const sellerReply = raw?.seller_reply ?? raw?.reply ?? raw?.seller_response;
  const replyText = typeof sellerReply === "string" ? sellerReply : (sellerReply?.comment ?? "");
  const replied = !!(replyText || raw?.is_replied || raw?.has_reply);

  // Product info — may come back via the rating row or via a sibling
  // item_list. Try the per-row fields first.
  const itemId = Number(raw?.item_id ?? raw?.itemid ?? 0) || null;
  const itemName = String(raw?.item_name ?? raw?.product_name ?? raw?.itemname ?? "");
  // Some shapes return images as an array of URLs at top level, others under
  // raw.media[].images. Pick the first string we can find.
  let img: string | null = null;
  const candidates = [
    raw?.item_image,
    raw?.product_image,
    raw?.media?.image_url_list?.[0],
    Array.isArray(raw?.item_image_url_list) ? raw.item_image_url_list[0] : null,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.startsWith("http")) { img = c; break; }
  }

  return {
    key: `${toko_id}-${cid}`,
    toko_id, toko_nama,
    comment_id: cid,
    rating_star: Number(raw?.rating_star ?? raw?.rating ?? 0),
    comment: String(raw?.comment ?? ""),
    buyer: String(raw?.buyer_username ?? raw?.buyer ?? raw?.user?.username ?? ""),
    create_time: Number(raw?.create_time ?? raw?.createtime ?? 0),
    order_sn: String(raw?.order_sn ?? raw?.ordersn ?? ""),
    item_id: itemId,
    item_name: itemName,
    image_url: img,
    replied,
    reply_text: replyText,
    raw,
  };
}

function StarRow({ n, C }: { n: number; C: any }) {
  const max = 5;
  return (
    <div style={{ display: "inline-flex", gap: 1, fontSize: 14, lineHeight: 1 }}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} style={{ color: i < n ? "#fbbf24" : C.dim }}>★</span>
      ))}
      <span style={{ marginLeft: 6, color: C.muted, fontSize: 11, fontFamily: C.fontMono, fontWeight: 700 }}>{n}/5</span>
    </div>
  );
}

export default function ShopeeUlasanPage() {
  const { isDark } = useTheme();
  const C = isDark ? DARK : LIGHT;

  const [reviews, setReviews] = useState<Review[]>([]);
  const [tokoOpts, setTokoOpts] = useState<{ id: number; nama: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const [filterToko, setFilterToko] = useState<string>("semua");
  const [filterStar, setFilterStar] = useState<string>("semua");
  const [filterReply, setFilterReply] = useState<"semua" | "belum" | "sudah">("semua");

  const [replyOpenKey, setReplyOpenKey] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState<string>("");
  const [submittingKey, setSubmittingKey] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/shopee/get-ratings");
      const data = await res.json();
      const all: Review[] = [];
      const opts: { id: number; nama: string }[] = [];
      for (const r of data.results || []) {
        opts.push({ id: r.toko_id, nama: r.toko });
        if (!r.ok) continue;
        const list = r.raw?.response?.rating_list ?? r.raw?.response?.ratings ?? [];
        if (!Array.isArray(list)) continue;
        for (const row of list) all.push(parseReview(r.toko_id, r.toko, row));
      }
      all.sort((a, b) => b.create_time - a.create_time);
      setReviews(all);
      setTokoOpts(opts);
    } catch (err: any) {
      showToast("Gagal load: " + err.message, "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filtered = useMemo(() => reviews.filter(r => {
    if (filterToko !== "semua" && String(r.toko_id) !== filterToko) return false;
    if (filterStar !== "semua" && r.rating_star !== Number(filterStar)) return false;
    if (filterReply === "belum" && r.replied) return false;
    if (filterReply === "sudah" && !r.replied) return false;
    return true;
  }), [reviews, filterToko, filterStar, filterReply]);

  // Unreplied counts per toko (for the badge).
  const unrepliedByToko = useMemo(() => {
    const map = new Map<number, number>();
    for (const r of reviews) {
      if (!r.replied) map.set(r.toko_id, (map.get(r.toko_id) || 0) + 1);
    }
    return map;
  }, [reviews]);

  const openReply = (r: Review) => {
    setReplyOpenKey(r.key);
    setReplyDraft("");
  };

  const submitReply = async (r: Review) => {
    if (!replyDraft.trim()) return showToast("Balasan kosong", "error");
    setSubmittingKey(r.key);
    try {
      const res = await fetch("/api/shopee/reply-rating", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toko_id: r.toko_id,
          comment_id: r.comment_id,
          reply: replyDraft.trim(),
        }),
      });
      const data = await res.json();
      if (!data.success) {
        showToast(data.error || data.raw?.message || data.raw?.error || "Gagal", "error");
        return;
      }
      // Optimistic local update: mark as replied so the badge ticks down
      // without a full refetch.
      setReviews(prev => prev.map(x => x.key === r.key
        ? { ...x, replied: true, reply_text: replyDraft.trim() }
        : x));
      setReplyOpenKey(null);
      setReplyDraft("");
      showToast("✓ Balasan terkirim");
    } catch (err: any) {
      showToast("Gagal: " + err.message, "error");
    } finally {
      setSubmittingKey(null);
    }
  };

  const pillStyle = (active: boolean): React.CSSProperties => ({
    padding: "4px 12px",
    background: active ? `${C.accent}20` : "transparent",
    border: `1.5px solid ${active ? C.accent : C.border}`,
    borderRadius: 20,
    color: active ? C.accent : C.muted,
    cursor: "pointer", fontSize: 12, fontWeight: active ? 700 : 500,
    fontFamily: C.fontSans, transition: "all 0.15s",
    display: "inline-flex", alignItems: "center", gap: 6,
  });

  return (
    <AppShell pageTitle="Shopee · Ulasan" pageSubtitle="Review pembeli & balasan">
      {toast && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 9999, padding: "12px 18px",
          background: toast.type === "success" ? C.green : C.red, color: "#fff",
          borderRadius: 10, fontSize: 13, fontWeight: 700, boxShadow: C.shadowMd,
        }}>{toast.msg}</div>
      )}

      <div style={{ padding: "24px 28px" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: 0 }}>Ulasan</h1>
            <p style={{ fontSize: 12, color: C.muted, fontFamily: C.fontMono, margin: "4px 0 0" }}>
              {filtered.length} review · {Array.from(unrepliedByToko.values()).reduce((a, b) => a + b, 0)} belum dibalas
            </p>
          </div>
          <button onClick={fetchAll} disabled={loading} style={{
            padding: "8px 16px",
            background: "transparent", border: `1.5px solid ${C.border}`,
            color: C.muted, borderRadius: 8, cursor: "pointer",
            fontSize: 13, fontWeight: 700, opacity: loading ? 0.5 : 1,
          }}>{loading ? "⏳" : "↻"} Refresh</button>
        </div>

        {/* Filters */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 20 }}>
          {/* Toko row with per-toko unreplied badges */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, fontFamily: C.fontMono, minWidth: 80 }}>Toko</span>
            <button style={pillStyle(filterToko === "semua")} onClick={() => setFilterToko("semua")}>Semua</button>
            {tokoOpts.map(t => {
              const unread = unrepliedByToko.get(t.id) || 0;
              return (
                <button key={t.id} style={pillStyle(filterToko === String(t.id))} onClick={() => setFilterToko(String(t.id))}>
                  {t.nama}
                  {unread > 0 && (
                    <span style={{
                      fontSize: 10, padding: "1px 6px", borderRadius: 10,
                      background: C.red, color: "#fff", fontWeight: 800, fontFamily: C.fontMono,
                    }}>{unread}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Bintang row */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, fontFamily: C.fontMono, minWidth: 80 }}>Bintang</span>
            <button style={pillStyle(filterStar === "semua")} onClick={() => setFilterStar("semua")}>Semua</button>
            {[5, 4, 3, 2, 1].map(s => (
              <button key={s} style={pillStyle(filterStar === String(s))} onClick={() => setFilterStar(String(s))}>
                {s} <span style={{ color: "#fbbf24" }}>★</span>
              </button>
            ))}
          </div>

          {/* Reply status row */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, fontFamily: C.fontMono, minWidth: 80 }}>Status</span>
            {([
              { k: "semua", l: "Semua" },
              { k: "belum", l: "Belum Dibalas" },
              { k: "sudah", l: "Sudah Dibalas" },
            ] as const).map(o => (
              <button key={o.k} style={pillStyle(filterReply === o.k)} onClick={() => setFilterReply(o.k)}>
                {o.l}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        {loading && reviews.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: C.muted, fontFamily: C.fontMono, fontSize: 13 }}>
            Memuat ulasan...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{
            padding: 40, textAlign: "center", color: C.muted, fontFamily: C.fontMono, fontSize: 13,
            background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
          }}>
            Tidak ada ulasan yang cocok dengan filter
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {filtered.map(r => {
              const replyOpen = replyOpenKey === r.key;
              const submitting = submittingKey === r.key;
              return (
                <div key={r.key} style={{
                  background: C.card, border: `1px solid ${C.border}`,
                  borderRadius: 14, padding: "14px 16px", boxShadow: C.shadow,
                }}>
                  <div style={{ display: "grid", gridTemplateColumns: "56px 1fr auto", gap: 12, alignItems: "flex-start" }}>
                    {/* Product image / placeholder */}
                    <div style={{
                      width: 56, height: 56, borderRadius: 10, overflow: "hidden",
                      background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
                      border: `1px solid ${C.border}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 22,
                    }}>
                      {r.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : "📦"}
                    </div>

                    {/* Main column */}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <StarRow n={r.rating_star} C={C} />
                        <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{sensorName(r.buyer)}</span>
                        <span style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>· {r.toko_nama}</span>
                        <span style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>· {unixToWIB(r.create_time)}</span>
                      </div>

                      {r.item_name && (
                        <div style={{ fontSize: 12, color: C.textMid, fontFamily: C.fontSans, marginTop: 4 }}>
                          {r.item_name}
                        </div>
                      )}

                      <div style={{ fontSize: 13, color: C.text, marginTop: 8, lineHeight: 1.5, fontFamily: C.fontSans, whiteSpace: "pre-wrap" }}>
                        {r.comment || <span style={{ color: C.muted, fontStyle: "italic" }}>(tanpa komentar)</span>}
                      </div>

                      {r.replied && r.reply_text && (
                        <div style={{
                          marginTop: 10, padding: "8px 12px",
                          background: `${C.accent}0d`,
                          borderLeft: `3px solid ${C.accent}`,
                          borderRadius: 6,
                          fontSize: 12, color: C.textMid, fontFamily: C.fontSans, lineHeight: 1.5,
                        }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: C.accent, fontFamily: C.fontMono, letterSpacing: 0.5, marginBottom: 2 }}>BALASAN ANDA</div>
                          {r.reply_text}
                        </div>
                      )}

                      {replyOpen && (
                        <div style={{ marginTop: 10 }}>
                          <textarea
                            value={replyDraft}
                            onChange={e => setReplyDraft(e.target.value)}
                            placeholder="Tulis balasan untuk pembeli..."
                            rows={3}
                            style={{
                              width: "100%", padding: "9px 12px",
                              background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
                              border: `1.5px solid ${C.border}`, borderRadius: 8,
                              color: C.text, fontFamily: C.fontSans, fontSize: 13,
                              outline: "none", resize: "vertical", boxSizing: "border-box",
                            }}
                          />
                          <div style={{ display: "flex", gap: 6, marginTop: 6, justifyContent: "flex-end" }}>
                            <button onClick={() => { setReplyOpenKey(null); setReplyDraft(""); }} disabled={submitting} style={{
                              padding: "7px 14px", background: "transparent",
                              border: `1.5px solid ${C.border}`, color: C.muted,
                              borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 12,
                            }}>Batal</button>
                            <button onClick={() => submitReply(r)} disabled={submitting || !replyDraft.trim()} style={{
                              padding: "7px 14px",
                              background: `linear-gradient(135deg, ${C.accentDark}, ${C.accent})`,
                              border: "none", color: "#fff", borderRadius: 8,
                              cursor: submitting ? "wait" : "pointer", fontWeight: 700, fontSize: 12,
                              opacity: submitting ? 0.7 : 1,
                            }}>
                              {submitting ? "Mengirim..." : "Kirim Balasan"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Action column */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "stretch" }}>
                      {!r.replied && !replyOpen && (
                        <button onClick={() => openReply(r)} style={{
                          padding: "7px 14px",
                          background: `${C.accent}20`, color: C.accent,
                          border: `1px solid ${C.accent}`, borderRadius: 8,
                          cursor: "pointer", fontWeight: 700, fontSize: 12,
                          fontFamily: C.fontSans, whiteSpace: "nowrap",
                        }}>💬 Balas</button>
                      )}
                      {r.replied && (
                        <span style={{
                          padding: "4px 10px", background: C.greenDim, color: C.green,
                          borderRadius: 20, fontSize: 10, fontWeight: 700, fontFamily: C.fontMono,
                          textAlign: "center",
                        }}>✓ Dibalas</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
