"use client";
import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Pelanggan, Produk, HargaKhusus, Toast, rupiahFmt, formatIDR, toAngka } from "../adminTypes";

interface Props { C: any; isDark: boolean; showToast: (msg: string, type?: Toast["type"]) => void; }
type PelangganForm = { nama: string; telepon: string; alamat: string; catatan: string };
const emptyForm = (): PelangganForm => ({ nama: "", telepon: "", alamat: "", catatan: "" });

export default function PelangganTab({ C, isDark, showToast }: Props) {
  const [pelangganList, setPelangganList] = useState<Pelanggan[]>([]);
  const [produkList, setProdukList] = useState<Produk[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchPelanggan, setSearchPelanggan] = useState("");
  const [showTambah, setShowTambah] = useState(false);
  const [tambah, setTambah] = useState<PelangganForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<PelangganForm>(emptyForm());
  const [savingEdit, setSavingEdit] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Harga khusus
  const [hargaPanel, setHargaPanel] = useState<number | null>(null);
  const [hargaList, setHargaList] = useState<HargaKhusus[]>([]);
  const [hargaLoading, setHargaLoading] = useState(false);
  const [hargaProdukId, setHargaProdukId] = useState("");
  const [hargaNilai, setHargaNilai] = useState("");
  const [savingHarga, setSavingHarga] = useState(false);
  const [editingHargaId, setEditingHargaId] = useState<number | null>(null);
  const [editHargaNilai, setEditHargaNilai] = useState("");

  const inputStyle: React.CSSProperties = {
    padding: "8px 12px", background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
    border: `1.5px solid ${C.border}`, borderRadius: 8, color: C.text,
    fontFamily: C.fontSans, fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box",
  };

  const fetchPelanggan = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("pelanggan_offline").select("*").order("nama");
    if (error) showToast("Gagal load pelanggan: " + error.message, "error");
    else setPelangganList(data || []);
    setLoading(false);
  }, []);

  const fetchProduk = useCallback(async () => {
    const { data } = await supabase.from("stok_barang").select("id, nama_produk, sku, jumlah_stok, harga_jual, satuan, berat_kg, stok_minimum").order("nama_produk");
    setProdukList(data || []);
  }, []);

  const fetchHargaKhusus = useCallback(async (pelangganId: number) => {
    setHargaLoading(true);
    const { data, error } = await supabase.from("pelanggan_harga").select("id, pelanggan_id, produk_id, harga, stok_barang(nama_produk)").eq("pelanggan_id", pelangganId).order("produk_id");
    if (error) showToast("Gagal load harga: " + error.message, "error");
    else setHargaList((data || []).map((r: any) => ({ ...r, nama_produk: r.stok_barang?.nama_produk })));
    setHargaLoading(false);
  }, []);

  useEffect(() => { fetchPelanggan(); fetchProduk(); }, [fetchPelanggan, fetchProduk]);

  const handleTambah = async () => {
    if (!tambah.nama.trim()) return showToast("Nama pelanggan wajib diisi!", "error");
    setSaving(true);
    const { error } = await supabase.from("pelanggan_offline").insert([{ nama: tambah.nama.trim(), telepon: tambah.telepon.trim() || null, alamat: tambah.alamat.trim() || null, catatan: tambah.catatan.trim() || null }]);
    if (error) showToast("Gagal tambah pelanggan: " + error.message, "error");
    else { showToast(`✓ Pelanggan "${tambah.nama}" ditambahkan!`); setTambah(emptyForm()); setShowTambah(false); fetchPelanggan(); }
    setSaving(false);
  };

  const handleEdit = async (id: number) => {
    if (!editForm.nama.trim()) return showToast("Nama pelanggan wajib diisi!", "error");
    setSavingEdit(true);
    const { error } = await supabase.from("pelanggan_offline").update({ nama: editForm.nama.trim(), telepon: editForm.telepon.trim() || null, alamat: editForm.alamat.trim() || null, catatan: editForm.catatan.trim() || null }).eq("id", id);
    if (error) showToast("Gagal update pelanggan: " + error.message, "error");
    else { showToast("✓ Pelanggan berhasil diupdate!"); setEditingId(null); fetchPelanggan(); }
    setSavingEdit(false);
  };

  const handleHapus = async (id: number, nama: string) => {
    setDeletingId(id);
    const { error } = await supabase.from("pelanggan_offline").delete().eq("id", id);
    if (error) showToast("Gagal hapus pelanggan: " + error.message, "error");
    else { showToast(`🗑 Pelanggan "${nama}" dihapus`); setConfirmDeleteId(null); fetchPelanggan(); }
    setDeletingId(null);
  };

  const bukaHargaPanel = async (pelangganId: number) => {
    if (hargaPanel === pelangganId) { setHargaPanel(null); return; }
    setHargaPanel(pelangganId);
    setHargaProdukId(""); setHargaNilai(""); setEditingHargaId(null);
    await fetchHargaKhusus(pelangganId);
  };

  const simpanHarga = async (pelangganId: number) => {
    if (!hargaProdukId) return showToast("Pilih produk!", "error");
    if (!hargaNilai) return showToast("Isi harga!", "error");
    setSavingHarga(true);
    const { error } = await supabase.from("pelanggan_harga").upsert([{ pelanggan_id: pelangganId, produk_id: parseInt(hargaProdukId), harga: toAngka(hargaNilai) }], { onConflict: "pelanggan_id,produk_id" });
    if (error) showToast("Gagal simpan harga: " + error.message, "error");
    else { showToast("✓ Harga khusus disimpan!"); setHargaProdukId(""); setHargaNilai(""); await fetchHargaKhusus(pelangganId); }
    setSavingHarga(false);
  };

  const updateHarga = async (hargaId: number, pelangganId: number) => {
    if (!editHargaNilai) return showToast("Isi harga!", "error");
    const { error } = await supabase.from("pelanggan_harga").update({ harga: toAngka(editHargaNilai) }).eq("id", hargaId);
    if (error) showToast("Gagal update: " + error.message, "error");
    else { showToast("✓ Harga diupdate!"); setEditingHargaId(null); await fetchHargaKhusus(pelangganId); }
  };

  const hapusHarga = async (hargaId: number, pelangganId: number) => {
    const { error } = await supabase.from("pelanggan_harga").delete().eq("id", hargaId);
    if (error) showToast("Gagal hapus: " + error.message, "error");
    else { showToast("🗑 Harga dihapus"); await fetchHargaKhusus(pelangganId); }
  };

  const pelangganFiltered = pelangganList.filter(p =>
    searchPelanggan === "" ||
    p.nama?.toLowerCase().includes(searchPelanggan.toLowerCase()) ||
    (p.telepon || "").includes(searchPelanggan)
  );
  const produkBelumDiset = produkList.filter(p => !hargaList.some(h => h.produk_id === p.id));

  return (
    <div style={{ animation: "fadeUp 0.3s ease" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: C.text }}>Master Pelanggan Offline</h2>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: C.muted, fontFamily: C.fontMono }}>{pelangganList.length} pelanggan terdaftar</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <input value={searchPelanggan} onChange={e => setSearchPelanggan(e.target.value)} placeholder="🔍 Cari nama atau telepon..." style={{ ...inputStyle, width: 220 }} />
          <button onClick={() => { setShowTambah(v => !v); setTambah(emptyForm()); setEditingId(null); }} style={{ padding: "9px 18px", background: showTambah ? "transparent" : `linear-gradient(135deg, ${C.accentDark}, ${C.accent})`, border: showTambah ? `1px solid ${C.border}` : "none", color: showTambah ? C.muted : "#fff", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: C.fontSans, whiteSpace: "nowrap" }}>
            {showTambah ? "✕ Tutup" : "+ Tambah Pelanggan"}
          </button>
        </div>
      </div>

      {showTambah && (
        <div style={{ background: `${C.accent}06`, border: `1px solid ${C.accent}30`, borderRadius: 14, padding: 24, marginBottom: 20, animation: "slideDown 0.2s ease" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.accent, fontFamily: C.fontMono, marginBottom: 16, letterSpacing: 1 }}>+ PELANGGAN BARU</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, marginBottom: 5, textTransform: "uppercase" as const }}>NAMA *</div>
              <input value={tambah.nama} onChange={e => setTambah(p => ({ ...p, nama: e.target.value }))} placeholder="Nama pelanggan" style={inputStyle} autoFocus />
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, marginBottom: 5, textTransform: "uppercase" as const }}>NO. TELEPON</div>
              <input value={tambah.telepon} onChange={e => setTambah(p => ({ ...p, telepon: e.target.value }))} placeholder="08xx-xxxx-xxxx" style={{ ...inputStyle, fontFamily: C.fontMono }} />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, marginBottom: 5, textTransform: "uppercase" as const }}>ALAMAT</div>
            <input value={tambah.alamat} onChange={e => setTambah(p => ({ ...p, alamat: e.target.value }))} placeholder="Alamat pengiriman (opsional)" style={inputStyle} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, marginBottom: 5, textTransform: "uppercase" as const }}>CATATAN</div>
            <input value={tambah.catatan} onChange={e => setTambah(p => ({ ...p, catatan: e.target.value }))} placeholder="Catatan khusus (opsional)" style={inputStyle} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleTambah} disabled={saving} style={{ padding: "9px 20px", background: `linear-gradient(135deg, ${C.accentDark}, ${C.accent})`, border: "none", color: "#fff", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: C.fontMono, opacity: saving ? 0.6 : 1 }}>{saving ? "Menyimpan..." : "✓ Simpan Pelanggan"}</button>
            <button onClick={() => setShowTambah(false)} style={{ padding: "9px 16px", background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 8, cursor: "pointer", fontSize: 12, fontFamily: C.fontMono }}>Batal</button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {loading && <div style={{ padding: 40, textAlign: "center", color: C.muted, fontFamily: C.fontMono }}>Memuat...</div>}
        {!loading && pelangganFiltered.length === 0 && <div style={{ padding: 40, textAlign: "center", color: C.muted, fontFamily: C.fontMono }}>{searchPelanggan ? "Tidak ada hasil" : "Belum ada pelanggan"}</div>}
        {!loading && pelangganFiltered.map(p => (
          <div key={p.id} style={{ background: C.card, border: `1px solid ${hargaPanel === p.id ? C.purple + "60" : C.border}`, borderRadius: 12, overflow: "hidden", transition: "border-color 0.2s" }}>
            {editingId !== p.id ? (
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 20px" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.textMid }}>{p.nama}</div>
                  <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono, marginTop: 2 }}>{p.telepon || "—"} {p.alamat ? `· ${p.alamat}` : ""}</div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => bukaHargaPanel(p.id)} style={{ padding: "5px 12px", background: hargaPanel === p.id ? `${C.purple}25` : `${C.purple}10`, border: `1px solid ${C.purple}40`, color: C.purple, borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: C.fontMono, fontWeight: 700 }}>
                    💰 Harga {hargaPanel === p.id ? "▲" : "▼"}
                  </button>
                  <button className="btn-edit" onClick={() => { setEditingId(p.id); setEditForm({ nama: p.nama, telepon: p.telepon || "", alamat: p.alamat || "", catatan: p.catatan || "" }); setShowTambah(false); setConfirmDeleteId(null); setHargaPanel(null); }} style={{ background: `${C.accent}15`, border: `1px solid ${C.accent}30`, color: C.accent, padding: "5px 10px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: C.fontMono, fontWeight: 700 }}>Edit</button>
                  <button className="btn-del" onClick={() => setConfirmDeleteId(confirmDeleteId === p.id ? null : p.id)} style={{ background: `${C.red}15`, border: `1px solid ${C.red}25`, color: C.red, padding: "5px 10px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: C.fontMono, fontWeight: 700 }}>Hapus</button>
                </div>
              </div>
            ) : (
              <div style={{ padding: "14px 20px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                  <input value={editForm.nama} onChange={e => setEditForm(f => ({ ...f, nama: e.target.value }))} placeholder="Nama pelanggan *" style={inputStyle} autoFocus />
                  <input value={editForm.telepon} onChange={e => setEditForm(f => ({ ...f, telepon: e.target.value }))} placeholder="Telepon" style={{ ...inputStyle, fontFamily: C.fontMono }} />
                </div>
                <input value={editForm.alamat} onChange={e => setEditForm(f => ({ ...f, alamat: e.target.value }))} placeholder="Alamat" style={{ ...inputStyle, marginBottom: 10 }} />
                <input value={editForm.catatan} onChange={e => setEditForm(f => ({ ...f, catatan: e.target.value }))} placeholder="Catatan" style={{ ...inputStyle, marginBottom: 12 }} />
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => handleEdit(p.id)} disabled={savingEdit} style={{ padding: "9px 20px", background: `linear-gradient(135deg, ${C.accentDark}, ${C.accent})`, border: "none", color: "#fff", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: C.fontMono }}>{savingEdit ? "..." : "✓ Simpan"}</button>
                  <button onClick={() => setEditingId(null)} style={{ padding: "9px 14px", background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 8, cursor: "pointer", fontSize: 12, fontFamily: C.fontMono }}>Batal</button>
                </div>
              </div>
            )}
            {confirmDeleteId === p.id && (
              <div style={{ padding: "10px 20px 14px", background: `${C.red}08`, borderTop: `1px solid ${C.red}20`, display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 12, color: C.red, fontFamily: C.fontMono }}>⚠ Hapus "{p.nama}"?</span>
                <button onClick={() => handleHapus(p.id, p.nama)} disabled={deletingId === p.id} style={{ background: C.red, border: "none", color: "#fff", padding: "6px 14px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontFamily: C.fontMono, fontWeight: 700 }}>{deletingId === p.id ? "..." : "Ya, Hapus"}</button>
                <button onClick={() => setConfirmDeleteId(null)} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, padding: "6px 10px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontFamily: C.fontMono }}>Batal</button>
              </div>
            )}
            {hargaPanel === p.id && (
              <div style={{ borderTop: `1px solid ${C.purple}30`, background: isDark ? "rgba(167,139,250,0.04)" : "rgba(167,139,250,0.05)", padding: "16px 20px", animation: "slideDown 0.2s ease" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.purple, fontFamily: C.fontMono, letterSpacing: 1, marginBottom: 14 }}>
                  💰 HARGA KHUSUS — {p.nama}
                  <span style={{ fontSize: 10, color: C.muted, fontWeight: 400, marginLeft: 8 }}>kalau tidak diset, pakai harga master</span>
                </div>
                {hargaLoading ? <div style={{ color: C.muted, fontFamily: C.fontMono, fontSize: 12, marginBottom: 12 }}>Memuat...</div>
                  : hargaList.length === 0 ? <div style={{ color: C.muted, fontFamily: C.fontMono, fontSize: 12, marginBottom: 12, fontStyle: "italic" }}>Belum ada harga khusus</div>
                  : (
                    <div style={{ marginBottom: 14 }}>
                      {hargaList.map(h => (
                        <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: `1px solid ${C.border}` }}>
                          <div style={{ flex: 1, fontSize: 12, color: C.textMid, fontWeight: 600 }}>{h.nama_produk || `Produk #${h.produk_id}`}</div>
                          {editingHargaId === h.id ? (
                            <>
                              <input value={editHargaNilai} onChange={e => setEditHargaNilai(formatIDR(e.target.value))} style={{ ...inputStyle, width: 140, fontFamily: C.fontMono, fontSize: 12 }} autoFocus onKeyDown={e => e.key === "Enter" && updateHarga(h.id, p.id)} />
                              <button onClick={() => updateHarga(h.id, p.id)} style={{ padding: "5px 12px", background: C.green + "20", border: `1px solid ${C.green}40`, color: C.green, borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: C.fontMono, fontWeight: 700 }}>✓</button>
                              <button onClick={() => setEditingHargaId(null)} style={{ padding: "5px 8px", background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 6, cursor: "pointer", fontSize: 11 }}>✕</button>
                            </>
                          ) : (
                            <>
                              <div style={{ fontSize: 13, fontWeight: 700, color: C.yellow, fontFamily: C.fontMono, minWidth: 120, textAlign: "right" }}>{rupiahFmt(h.harga)}</div>
                              <button onClick={() => { setEditingHargaId(h.id); setEditHargaNilai(formatIDR(String(h.harga))); }} style={{ padding: "4px 10px", background: `${C.accent}15`, border: `1px solid ${C.accent}30`, color: C.accent, borderRadius: 5, cursor: "pointer", fontSize: 10, fontFamily: C.fontMono, fontWeight: 700 }}>Edit</button>
                              <button onClick={() => hapusHarga(h.id, p.id)} style={{ padding: "4px 8px", background: `${C.red}15`, border: `1px solid ${C.red}25`, color: C.red, borderRadius: 5, cursor: "pointer", fontSize: 10, fontFamily: C.fontMono, fontWeight: 700 }}>🗑</button>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                {produkBelumDiset.length > 0 && (
                  <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                    <div style={{ flex: 2 }}>
                      <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, marginBottom: 5, textTransform: "uppercase" as const }}>PRODUK</div>
                      <select value={hargaProdukId} onChange={e => setHargaProdukId(e.target.value)} style={{ ...inputStyle, fontSize: 12 }}>
                        <option value="">— Pilih Produk —</option>
                        {produkBelumDiset.map(pr => <option key={pr.id} value={pr.id}>{pr.nama_produk} (master: {rupiahFmt(pr.harga_jual)})</option>)}
                      </select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, marginBottom: 5, textTransform: "uppercase" as const }}>HARGA KHUSUS</div>
                      <input value={hargaNilai} onChange={e => setHargaNilai(formatIDR(e.target.value))} placeholder="0" style={{ ...inputStyle, fontFamily: C.fontMono, fontSize: 12 }} onKeyDown={e => e.key === "Enter" && simpanHarga(p.id)} />
                    </div>
                    <button onClick={() => simpanHarga(p.id)} disabled={savingHarga} style={{ padding: "8px 16px", background: `linear-gradient(135deg, #7c3aed, ${C.purple})`, border: "none", color: "#fff", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: C.fontMono, whiteSpace: "nowrap", marginBottom: 1 }}>
                      {savingHarga ? "..." : "+ Simpan"}
                    </button>
                  </div>
                )}
                {produkBelumDiset.length === 0 && hargaList.length > 0 && (
                  <div style={{ fontSize: 11, color: C.green, fontFamily: C.fontMono }}>✓ Semua produk sudah diset harga khusus</div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
