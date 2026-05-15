"use client";
import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { BahanBakuFull, Toast, SATUAN_BAHAN_OPTIONS, KATEGORI_BAHAN_OPTIONS, rupiahFmt, tanggalJamFmt } from "../adminTypes";

interface Props { C: any; isDark: boolean; showToast: (msg: string, type?: Toast["type"]) => void; }
type BahanForm = { nama: string; satuan: string; kategori: string };
const emptyForm = (): BahanForm => ({ nama: "", satuan: "kg", kategori: "Bahan Baku" });

export default function BahanTab({ C, isDark, showToast }: Props) {
  const [bahanList, setBahanList] = useState<BahanBakuFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchBahan, setSearchBahan] = useState("");
  const [filterKategori, setFilterKategori] = useState("Semua");
  const [showTambah, setShowTambah] = useState(false);
  const [tambah, setTambah] = useState<BahanForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<BahanForm>(emptyForm());
  const [savingEdit, setSavingEdit] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const inputStyle: React.CSSProperties = {
    padding: "8px 12px", background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
    border: `1.5px solid ${C.border}`, borderRadius: 8, color: C.text,
    fontFamily: C.fontSans, fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box",
  };

  const fetchBahan = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("bahan_baku").select("id, nama, satuan, kategori, stok, harga_beli_avg, aktif, updated_at").or("aktif.eq.true,aktif.is.null").order("kategori").order("nama");
    if (error) showToast("Gagal load bahan: " + error.message, "error");
    else setBahanList(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchBahan(); }, [fetchBahan]);

  const handleTambah = async () => {
    if (!tambah.nama.trim()) return showToast("Nama bahan wajib diisi!", "error");
    setSaving(true);
    const { error } = await supabase.from("bahan_baku").insert([{ nama: tambah.nama.trim(), satuan: tambah.satuan, kategori: tambah.kategori, aktif: true, stok: 0, harga_beli_avg: 0, total_nilai_stok: 0 }]);
    if (error) showToast("Gagal tambah bahan: " + error.message, "error");
    else { showToast(`✓ Bahan "${tambah.nama}" ditambahkan!`); setTambah(emptyForm()); setShowTambah(false); fetchBahan(); }
    setSaving(false);
  };

  const handleEdit = async (id: number) => {
    if (!editForm.nama.trim()) return showToast("Nama bahan wajib diisi!", "error");
    setSavingEdit(true);
    const { error } = await supabase.from("bahan_baku").update({ nama: editForm.nama.trim(), satuan: editForm.satuan, kategori: editForm.kategori }).eq("id", id);
    if (error) showToast("Gagal update bahan: " + error.message, "error");
    else { showToast("✓ Bahan berhasil diupdate!"); setEditingId(null); fetchBahan(); }
    setSavingEdit(false);
  };

  const handleHapus = async (id: number, nama: string) => {
    setDeletingId(id);
    const { error } = await supabase.from("bahan_baku").update({ aktif: false }).eq("id", id);
    if (error) showToast("Gagal hapus: " + error.message, "error");
    else { showToast(`🗑 "${nama}" dihapus (soft delete)`); setConfirmDeleteId(null); fetchBahan(); }
    setDeletingId(null);
  };

  const bahanFiltered = bahanList.filter(b => {
    const matchKat = filterKategori === "Semua" || b.kategori === filterKategori;
    const matchSearch = searchBahan === "" || b.nama.toLowerCase().includes(searchBahan.toLowerCase());
    return matchKat && matchSearch;
  });

  return (
    <div style={{ animation: "fadeUp 0.3s ease" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: C.text }}>Master Bahan Baku</h2>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: C.muted, fontFamily: C.fontMono }}>{bahanList.length} bahan aktif · stok & HPP otomatis update saat pembelian</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <input value={searchBahan} onChange={e => setSearchBahan(e.target.value)} placeholder="🔍 Cari nama..." style={{ ...inputStyle, width: 180 }} />
          <button onClick={() => { setShowTambah(v => !v); setTambah(emptyForm()); setEditingId(null); }} style={{ padding: "9px 18px", background: showTambah ? "transparent" : `linear-gradient(135deg, ${C.accentDark}, ${C.accent})`, border: showTambah ? `1px solid ${C.border}` : "none", color: showTambah ? C.muted : "#fff", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: C.fontSans, whiteSpace: "nowrap" }}>
            {showTambah ? "✕ Tutup" : "+ Tambah Bahan"}
          </button>
        </div>
      </div>

      {showTambah && (
        <div style={{ background: `${C.accent}06`, border: `1px solid ${C.accent}30`, borderRadius: 14, padding: 24, marginBottom: 20, animation: "slideDown 0.2s ease" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.accent, fontFamily: C.fontMono, marginBottom: 16, letterSpacing: 1 }}>+ BAHAN BARU</div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, marginBottom: 5, textTransform: "uppercase" as const }}>NAMA BAHAN *</div>
              <input value={tambah.nama} onChange={e => setTambah(f => ({ ...f, nama: e.target.value }))} onKeyDown={e => e.key === "Enter" && handleTambah()} placeholder="Nama bahan baru" style={inputStyle} autoFocus />
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, marginBottom: 5, textTransform: "uppercase" as const }}>SATUAN</div>
              <select value={tambah.satuan} onChange={e => setTambah(f => ({ ...f, satuan: e.target.value }))} style={{ ...inputStyle, cursor: "pointer" }}>{SATUAN_BAHAN_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}</select>
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, marginBottom: 5, textTransform: "uppercase" as const }}>KATEGORI</div>
              <select value={tambah.kategori} onChange={e => setTambah(f => ({ ...f, kategori: e.target.value }))} style={{ ...inputStyle, cursor: "pointer" }}>{KATEGORI_BAHAN_OPTIONS.map(k => <option key={k} value={k}>{k}</option>)}</select>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleTambah} disabled={saving} style={{ padding: "9px 20px", background: `linear-gradient(135deg, ${C.accentDark}, ${C.accent})`, border: "none", color: "#fff", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: C.fontMono, opacity: saving ? 0.6 : 1 }}>{saving ? "Menyimpan..." : "✓ Simpan Bahan"}</button>
            <button onClick={() => setShowTambah(false)} style={{ padding: "9px 16px", background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 8, cursor: "pointer", fontSize: 12, fontFamily: C.fontMono }}>Batal</button>
          </div>
        </div>
      )}

      {/* Filter Kategori */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {["Semua", ...KATEGORI_BAHAN_OPTIONS].map(k => (
          <button key={k} onClick={() => setFilterKategori(k)} style={{ padding: "6px 14px", borderRadius: 20, border: `1px solid ${filterKategori === k ? C.accent + "60" : C.border}`, background: filterKategori === k ? `${C.accent}15` : "transparent", color: filterKategori === k ? C.accent : C.muted, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: C.fontSans }}>
            {k} {k !== "Semua" && `(${bahanList.filter(b => b.kategori === k).length})`}
          </button>
        ))}
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 0.8fr 0.8fr 1fr 1.2fr 1.4fr", gap: 8, padding: "10px 24px", borderBottom: `1px solid ${C.border}`, background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)" }}>
          {["NAMA BAHAN", "KATEGORI", "STOK", "HPP / SATUAN", "TERAKHIR UPDATE", "AKSI"].map(h => (
            <div key={h} style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1.5, fontWeight: 700 }}>{h}</div>
          ))}
        </div>
        {loading && <div style={{ padding: 40, textAlign: "center", color: C.muted, fontFamily: C.fontMono }}>Memuat...</div>}
        {!loading && bahanFiltered.length === 0 && <div style={{ padding: 40, textAlign: "center", color: C.muted, fontFamily: C.fontMono }}>{searchBahan ? "Tidak ditemukan." : "Belum ada bahan aktif."}</div>}
        {!loading && bahanFiltered.map(b => {
          const catColor = b.kategori === "Bahan Baku" ? C.blue : b.kategori === "Bahan Penolong" ? C.yellow : C.purple;
          return (
            <div key={b.id} style={{ borderBottom: `1px solid ${C.border}`, background: editingId === b.id ? `${C.purple}05` : "transparent" }}>
              {editingId !== b.id ? (
                <div className="data-row" style={{ display: "grid", gridTemplateColumns: "2fr 0.8fr 0.8fr 1fr 1.2fr 1.4fr", gap: 8, padding: "12px 24px", alignItems: "center", transition: "background 0.15s" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.textMid }}>{b.nama}</div>
                  <div><span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: catColor + "20", color: catColor }}>{b.kategori}</span></div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: b.stok <= 0 ? C.red : C.green, fontFamily: C.fontMono }}>
                    {b.stok} <span style={{ fontSize: 10, fontWeight: 400, color: C.muted }}>{b.satuan}</span>
                    {b.stok <= 0 && <div style={{ fontSize: 10, color: C.red, fontWeight: 700 }}>⚠ Habis</div>}
                  </div>
                  <div style={{ fontSize: 12, color: C.textMid, fontFamily: C.fontMono }}>{rupiahFmt(b.harga_beli_avg)}/{b.satuan}</div>
                  <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>{b.updated_at ? tanggalJamFmt(b.updated_at) : "—"}</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {confirmDeleteId === b.id ? (
                      <>
                        <button onClick={() => handleHapus(b.id, b.nama)} disabled={deletingId === b.id} style={{ background: C.red, border: "none", color: "#fff", padding: "5px 10px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: C.fontMono, fontWeight: 700 }}>{deletingId === b.id ? "..." : "Hapus"}</button>
                        <button onClick={() => setConfirmDeleteId(null)} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, padding: "5px 7px", borderRadius: 6, cursor: "pointer", fontSize: 11 }}>✕</button>
                      </>
                    ) : (
                      <>
                        <button className="btn-edit" onClick={() => { setEditingId(b.id); setEditForm({ nama: b.nama, satuan: b.satuan, kategori: b.kategori }); setShowTambah(false); setConfirmDeleteId(null); }} style={{ background: `${C.accent}15`, border: `1px solid ${C.accent}30`, color: C.accent, padding: "5px 10px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: C.fontMono, fontWeight: 700 }}>Edit</button>
                        <button className="btn-del" onClick={() => setConfirmDeleteId(b.id)} style={{ background: `${C.red}15`, border: `1px solid ${C.red}25`, color: C.red, padding: "5px 10px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: C.fontMono, fontWeight: 700 }}>🗑</button>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ padding: "14px 24px", background: isDark ? `${C.purple}05` : `${C.purple}03` }}>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, marginBottom: 5, textTransform: "uppercase" as const }}>NAMA BAHAN</div>
                      <input value={editForm.nama} onChange={e => setEditForm(f => ({ ...f, nama: e.target.value }))} style={inputStyle} autoFocus />
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, marginBottom: 5, textTransform: "uppercase" as const }}>SATUAN</div>
                      <select value={editForm.satuan} onChange={e => setEditForm(f => ({ ...f, satuan: e.target.value }))} style={{ ...inputStyle, cursor: "pointer" }}>{SATUAN_BAHAN_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}</select>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, marginBottom: 5, textTransform: "uppercase" as const }}>KATEGORI</div>
                      <select value={editForm.kategori} onChange={e => setEditForm(f => ({ ...f, kategori: e.target.value }))} style={{ ...inputStyle, cursor: "pointer" }}>{KATEGORI_BAHAN_OPTIONS.map(k => <option key={k} value={k}>{k}</option>)}</select>
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono, marginBottom: 12 }}>
                    ℹ Stok (<strong style={{ color: C.green }}>{b.stok} {b.satuan}</strong>) dan HPP (<strong style={{ color: C.textMid }}>{rupiahFmt(b.harga_beli_avg)}</strong>) tidak bisa diedit manual.
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => handleEdit(b.id)} disabled={savingEdit} style={{ padding: "8px 18px", background: `linear-gradient(135deg, #7c3aed, ${C.purple})`, border: "none", color: "#fff", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: C.fontMono }}>{savingEdit ? "..." : "✓ Simpan"}</button>
                    <button onClick={() => setEditingId(null)} style={{ padding: "9px 14px", background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 8, cursor: "pointer", fontSize: 12, fontFamily: C.fontMono }}>Batal</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 16, background: `${C.blue}08`, border: `1px solid ${C.blue}20`, borderRadius: 10, padding: "14px 20px", fontSize: 12, color: C.blue, fontFamily: C.fontMono }}>
        🧪 <strong>Stok & HPP</strong> otomatis terupdate setiap ada pembelian bahan. &nbsp;·&nbsp; 🗑 <strong>Hapus</strong> adalah soft delete — data historis tetap aman.
      </div>
    </div>
  );
}
