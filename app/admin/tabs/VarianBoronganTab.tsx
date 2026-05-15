"use client";
import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Toast, rupiahFmt, formatIDR, toAngka } from "../adminTypes";

interface Props {
  C: any;
  isDark: boolean;
  showToast: (msg: string, type?: Toast["type"]) => void;
}

type VarianBorongan = {
  id: number;
  nama: string;
  tarif_per_kg: number;
  aktif: boolean;
  kategori: string;
};

const KATEGORI_OPTIONS = ["Pencetak", "Packing Online"];

export default function VarianBoronganTab({ C, isDark, showToast }: Props) {
  const [varianList, setVarianList] = useState<VarianBorongan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTambah, setShowTambah] = useState(false);
  const [tambahNama, setTambahNama] = useState("");
  const [tambahTarif, setTambahTarif] = useState("");
  const [tambahKategori, setTambahKategori] = useState("Pencetak");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editNama, setEditNama] = useState("");
  const [editTarif, setEditTarif] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [confirmHapusId, setConfirmHapusId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const inputStyle: React.CSSProperties = {
    padding: "8px 12px", background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
    border: `1.5px solid ${C.border}`, borderRadius: 8, color: C.text,
    fontFamily: C.fontSans, fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box",
  };

  const fetchVarian = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("varian_borongan").select("*").order("kategori").order("nama");
    if (error) showToast("Gagal load varian: " + error.message, "error");
    else setVarianList(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchVarian(); }, [fetchVarian]);

  const handleTambah = async () => {
    if (!tambahNama.trim()) return showToast("Nama varian wajib diisi!", "error");
    if (toAngka(tambahTarif) <= 0) return showToast("Tarif harus lebih dari 0!", "error");
    setSaving(true);
    const { error } = await supabase.from("varian_borongan").insert([{
      nama: tambahNama.trim(),
      tarif_per_kg: toAngka(tambahTarif),
      aktif: true,
      kategori: tambahKategori,
    }]);
    if (error) showToast("Gagal tambah: " + error.message, "error");
    else {
      showToast(`✓ Varian "${tambahNama}" ditambahkan!`);
      setTambahNama(""); setTambahTarif(""); setTambahKategori("Pencetak");
      setShowTambah(false);
      fetchVarian();
    }
    setSaving(false);
  };

  const handleEdit = async (id: number) => {
    if (!editNama.trim()) return showToast("Nama varian wajib diisi!", "error");
    if (toAngka(editTarif) <= 0) return showToast("Tarif harus lebih dari 0!", "error");
    setSavingEdit(true);
    const { error } = await supabase.from("varian_borongan").update({
      nama: editNama.trim(),
      tarif_per_kg: toAngka(editTarif),
    }).eq("id", id);
    if (error) showToast("Gagal update: " + error.message, "error");
    else { showToast("✓ Varian diupdate!"); setEditingId(null); fetchVarian(); }
    setSavingEdit(false);
  };

  const handleHapus = async (id: number, nama: string) => {
    setDeletingId(id);
    const { error } = await supabase.from("varian_borongan").update({ aktif: false }).eq("id", id);
    if (error) showToast("Gagal nonaktifkan: " + error.message, "error");
    else { showToast(`🗑 Varian "${nama}" dinonaktifkan`); setConfirmHapusId(null); fetchVarian(); }
    setDeletingId(null);
  };

  // Group by kategori
  const grouped = KATEGORI_OPTIONS.map(kat => ({
    kategori: kat,
    items: varianList.filter(v => v.kategori === kat),
  }));

  const kategoriColor = (kat: string) => kat === "Pencetak" ? C.green : C.blue;
  const kategoriIcon = (kat: string) => kat === "Pencetak" ? "⚖" : "📦";
  const kategoriDesc = (kat: string) => kat === "Pencetak"
    ? "Upah borongan per kg siomay yang dicetak"
    : "Upah packing per paket pesanan online";
  const tarifLabel = (kat: string) => kat === "Pencetak" ? "/ kg" : "/ paket";

  return (
    <div style={{ animation: "fadeUp 0.3s ease" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: C.text }}>Varian Borongan</h2>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: C.muted, fontFamily: C.fontMono }}>
            Master tarif upah borongan — Pencetak & Packing Online
          </p>
        </div>
        <button onClick={() => { setShowTambah(v => !v); setTambahNama(""); setTambahTarif(""); setTambahKategori("Pencetak"); }}
          style={{ padding: "9px 18px", background: showTambah ? "transparent" : `linear-gradient(135deg, ${C.accentDark}, ${C.accent})`, border: showTambah ? `1px solid ${C.border}` : "none", color: showTambah ? C.muted : "#fff", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: C.fontSans }}>
          {showTambah ? "✕ Tutup" : "+ Tambah Varian"}
        </button>
      </div>

      {/* Info banner */}
      <div style={{ background: `${C.yellow}10`, border: `1px solid ${C.yellow}25`, borderRadius: 10, padding: "12px 16px", marginBottom: 20, fontSize: 12, color: C.yellow, fontFamily: C.fontMono }}>
        💡 Ubah tarif di sini → otomatis berlaku ke <strong>semua</strong> karyawan yang punya PLU varian ini. Tidak perlu ubah satu-satu.
      </div>

      {/* Form Tambah */}
      {showTambah && (
        <div style={{ background: `${C.accent}08`, border: `1px solid ${C.accent}30`, borderRadius: 14, padding: 24, marginBottom: 20, animation: "slideDown 0.2s ease" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.accent, fontFamily: C.fontMono, marginBottom: 16, letterSpacing: 1 }}>+ VARIAN BARU</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr", gap: 12, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, marginBottom: 5, textTransform: "uppercase" as const }}>KATEGORI *</div>
              <select value={tambahKategori} onChange={e => setTambahKategori(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                {KATEGORI_OPTIONS.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, marginBottom: 5, textTransform: "uppercase" as const }}>NAMA VARIAN *</div>
              <input value={tambahNama} onChange={e => setTambahNama(e.target.value)}
                placeholder={tambahKategori === "Pencetak" ? "Contoh: Kuncup, Besar" : "Contoh: Paket Kecil, Paket Besar"}
                style={inputStyle} autoFocus onKeyDown={e => e.key === "Enter" && handleTambah()} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, marginBottom: 5, textTransform: "uppercase" as const }}>
                TARIF {tambahKategori === "Pencetak" ? "/ KG" : "/ PAKET"} (Rp) *
              </div>
              <input value={tambahTarif} onChange={e => setTambahTarif(formatIDR(e.target.value))} placeholder="0"
                style={{ ...inputStyle, fontFamily: C.fontMono, fontWeight: 700 }} onKeyDown={e => e.key === "Enter" && handleTambah()} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleTambah} disabled={saving}
              style={{ padding: "9px 20px", background: saving ? C.muted : `linear-gradient(135deg, ${C.accentDark}, ${C.accent})`, border: "none", color: "#fff", borderRadius: 8, cursor: saving ? "not-allowed" : "pointer", fontWeight: 700, fontSize: 13, fontFamily: C.fontMono, opacity: saving ? 0.6 : 1 }}>
              {saving ? "Menyimpan..." : "✓ Simpan Varian"}
            </button>
            <button onClick={() => setShowTambah(false)}
              style={{ padding: "9px 16px", background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 8, cursor: "pointer", fontSize: 12, fontFamily: C.fontMono }}>
              Batal
            </button>
          </div>
        </div>
      )}

      {/* Grouped by kategori */}
      {loading && <div style={{ padding: 40, textAlign: "center", color: C.muted, fontFamily: C.fontMono }}>Memuat...</div>}

      {!loading && grouped.map(({ kategori, items }) => (
        <div key={kategori} style={{ marginBottom: 24 }}>
          {/* Kategori header */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: `${kategoriColor(kategori)}20`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
              {kategoriIcon(kategori)}
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: kategoriColor(kategori) }}>{kategori}</div>
              <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>{kategoriDesc(kategori)}</div>
            </div>
            <div style={{ marginLeft: "auto", fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>
              {items.filter(v => v.aktif).length} aktif
            </div>
          </div>

          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
            {/* Table header */}
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 100px 140px", gap: 8, padding: "10px 24px", borderBottom: `1px solid ${C.border}`, background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)" }}>
              {["NAMA VARIAN", `TARIF ${kategori === "Pencetak" ? "/ KG" : "/ PAKET"}`, "STATUS", "AKSI"].map(h => (
                <div key={h} style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1.5, fontWeight: 700 }}>{h}</div>
              ))}
            </div>

            {items.length === 0 && (
              <div style={{ padding: 32, textAlign: "center", color: C.muted, fontFamily: C.fontMono, fontSize: 12 }}>
                Belum ada varian {kategori} — tambah dulu!
              </div>
            )}

            {items.map(v => (
              <div key={v.id} style={{ borderBottom: `1px solid ${C.border}`, background: editingId === v.id ? `${C.accent}06` : "transparent" }}>
                {editingId !== v.id ? (
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 100px 140px", gap: 8, padding: "14px 24px", alignItems: "center" }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{v.nama}</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: kategoriColor(kategori), fontFamily: C.fontMono }}>
                      {rupiahFmt(v.tarif_per_kg)}<span style={{ fontSize: 11, fontWeight: 400, color: C.muted }}>{tarifLabel(kategori)}</span>
                    </div>
                    <div>
                      <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 20, background: v.aktif ? `${C.green}20` : `${C.red}20`, color: v.aktif ? C.green : C.red, fontWeight: 700, fontFamily: C.fontMono }}>
                        {v.aktif ? "Aktif" : "Nonaktif"}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      {confirmHapusId === v.id ? (
                        <>
                          <button onClick={() => handleHapus(v.id, v.nama)} disabled={deletingId === v.id}
                            style={{ background: C.red, border: "none", color: "#fff", padding: "5px 10px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: C.fontMono, fontWeight: 700 }}>
                            {deletingId === v.id ? "..." : "Nonaktifkan"}
                          </button>
                          <button onClick={() => setConfirmHapusId(null)}
                            style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, padding: "5px 7px", borderRadius: 6, cursor: "pointer", fontSize: 11 }}>✕</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => { setEditingId(v.id); setEditNama(v.nama); setEditTarif(formatIDR(String(v.tarif_per_kg))); }}
                            style={{ background: `${C.accent}15`, border: `1px solid ${C.accent}30`, color: C.accent, padding: "5px 10px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: C.fontMono, fontWeight: 700 }}>Edit</button>
                          <button onClick={() => setConfirmHapusId(v.id)}
                            style={{ background: `${C.red}15`, border: `1px solid ${C.red}25`, color: C.red, padding: "5px 10px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: C.fontMono, fontWeight: 700 }}>🗑</button>
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: "14px 24px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, marginBottom: 12 }}>
                      <div>
                        <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, marginBottom: 5, textTransform: "uppercase" as const }}>NAMA VARIAN</div>
                        <input value={editNama} onChange={e => setEditNama(e.target.value)} style={inputStyle} autoFocus />
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, marginBottom: 5, textTransform: "uppercase" as const }}>
                          TARIF {v.kategori === "Pencetak" ? "/ KG" : "/ PAKET"}
                        </div>
                        <input value={editTarif} onChange={e => setEditTarif(formatIDR(e.target.value))} style={{ ...inputStyle, fontFamily: C.fontMono, fontWeight: 700 }} />
                      </div>
                    </div>
                    <div style={{ background: `${C.yellow}10`, border: `1px solid ${C.yellow}20`, borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 11, color: C.yellow, fontFamily: C.fontMono }}>
                      ⚠ Perubahan tarif akan berlaku ke semua PLU dengan varian ini
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => handleEdit(v.id)} disabled={savingEdit}
                        style={{ padding: "8px 18px", background: `linear-gradient(135deg, ${C.accentDark}, ${C.accent})`, border: "none", color: "#fff", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: C.fontMono }}>
                        {savingEdit ? "..." : "✓ Simpan"}
                      </button>
                      <button onClick={() => setEditingId(null)}
                        style={{ padding: "9px 14px", background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 8, cursor: "pointer", fontSize: 12, fontFamily: C.fontMono }}>
                        Batal
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
