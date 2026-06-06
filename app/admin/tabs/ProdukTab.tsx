"use client";
import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Produk, BahanBakuRef, PresetKemasan, Toast, SATUAN_OPTIONS, rupiahFmt, formatIDR, toAngka } from "../adminTypes";

interface Props { C: any; isDark: boolean; showToast: (msg: string, type?: Toast["type"]) => void; }
type ProdukForm = { nama_produk: string; sku: string; harga_jual: string; jumlah_stok: string; satuan: string; berat_kg: string; stok_minimum: string };
const emptyForm = (): ProdukForm => ({ nama_produk: "", sku: "", harga_jual: "", jumlah_stok: "0", satuan: "pcs", berat_kg: "", stok_minimum: "" });

const Label = ({ children, C }: { children: React.ReactNode; C: any }) => (
  <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1.2, fontWeight: 700, marginBottom: 5, textTransform: "uppercase" as const }}>{children}</div>
);

export default function ProdukTab({ C, isDark, showToast }: Props) {
  const [produkList, setProdukList] = useState<Produk[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchProduk, setSearchProduk] = useState("");
  const [showTambah, setShowTambah] = useState(false);
  const [tambah, setTambah] = useState<ProdukForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<ProdukForm>(emptyForm());
  const [savingEdit, setSavingEdit] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [bahanBakuRefList, setBahanBakuRefList] = useState<BahanBakuRef[]>([]);
  const [bahanBakuRefLoading, setBahanBakuRefLoading] = useState(false);
  const [kemasanPanel, setKemasanPanel] = useState<number | null>(null);
  const [kemasanList, setKemasanList] = useState<PresetKemasan[]>([]);
  const [kemasanLoading, setKemasanLoading] = useState(false);
  const [newKemasanBahanId, setNewKemasanBahanId] = useState("");
  const [newKemasanBeratGram, setNewKemasanBeratGram] = useState("");
  const [savingKemasan, setSavingKemasan] = useState(false);
  const [editingKemasanId, setEditingKemasanId] = useState<number | null>(null);
  const [editKemasanBerat, setEditKemasanBerat] = useState("");

  const inputStyle: React.CSSProperties = {
    padding: "8px 12px", background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
    border: `1.5px solid ${C.border}`, borderRadius: 8, color: C.text,
    fontFamily: C.fontSans, fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box",
  };

  const fetchProduk = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("stok_barang").select("id, nama_produk, sku, jumlah_stok, harga_jual, satuan, berat_kg, stok_minimum").order("nama_produk");
    if (error) showToast("Gagal load produk: " + error.message, "error");
    else setProdukList(data || []);
    setLoading(false);
  }, []);

  const fetchBahanBakuRef = useCallback(async () => {
    if (bahanBakuRefList.length > 0) return;
    setBahanBakuRefLoading(true);
    const { data, error } = await supabase.from("bahan_baku").select("id, nama, satuan, kategori").or("aktif.eq.true,aktif.is.null").order("kategori").order("nama");
    if (error) showToast("Gagal load bahan: " + error.message, "error");
    else setBahanBakuRefList(data || []);
    setBahanBakuRefLoading(false);
  }, [bahanBakuRefList.length]);

  const fetchPresetKemasan = useCallback(async (produkId: number) => {
    setKemasanLoading(true);
    const { data, error } = await supabase.from("produk_kemasan_default").select("id, stok_barang_id, bahan_baku_id, berat_gram, bahan_baku(nama, satuan)").eq("stok_barang_id", produkId).order("id");
    if (error) showToast("Gagal load kemasan: " + error.message, "error");
    else setKemasanList((data || []).map((r: any) => ({ ...r, nama_bahan: r.bahan_baku?.nama, satuan_bahan: r.bahan_baku?.satuan })));
    setKemasanLoading(false);
  }, []);

  useEffect(() => { fetchProduk(); }, [fetchProduk]);

  const buildPayload = (f: ProdukForm) => ({
    nama_produk: f.nama_produk.trim(),
    sku: f.sku.trim().toUpperCase() || null,
    harga_jual: toAngka(f.harga_jual),
    jumlah_stok: parseInt(f.jumlah_stok) || 0,
    satuan: f.satuan,
    berat_kg: f.berat_kg ? parseFloat(f.berat_kg.replace(",", ".")) : null,
    stok_minimum: f.stok_minimum !== "" ? parseInt(f.stok_minimum) : null,
  });

  const handleTambah = async () => {
    if (!tambah.nama_produk.trim()) return showToast("Nama produk wajib diisi!", "error");
    if (!tambah.harga_jual) return showToast("Harga jual wajib diisi!", "error");
    setSaving(true);
    const { error } = await supabase.from("stok_barang").insert([buildPayload(tambah)]);
    if (error) showToast("Gagal tambah produk: " + error.message, "error");
    else { showToast(`✓ Produk "${tambah.nama_produk}" ditambahkan!`); setTambah(emptyForm()); setShowTambah(false); fetchProduk(); }
    setSaving(false);
  };

  const handleEdit = async (id: number) => {
    if (!editForm.nama_produk.trim()) return showToast("Nama produk wajib diisi!", "error");
    setSavingEdit(true);
    const { error } = await supabase.from("stok_barang").update(buildPayload(editForm)).eq("id", id);
    if (error) showToast("Gagal update produk: " + error.message, "error");
    else { showToast("✓ Produk berhasil diupdate!"); setEditingId(null); fetchProduk(); }
    setSavingEdit(false);
  };

  const handleHapus = async (id: number, nama: string) => {
    setDeletingId(id);
    const { error } = await supabase.from("stok_barang").delete().eq("id", id);
    if (error) showToast("Gagal hapus: " + error.message, "error");
    else { showToast(`🗑 "${nama}" dihapus`); setConfirmDeleteId(null); fetchProduk(); }
    setDeletingId(null);
  };

  const bukaKemasan = async (produkId: number) => {
    if (kemasanPanel === produkId) { setKemasanPanel(null); return; }
    setKemasanPanel(produkId);
    setNewKemasanBahanId(""); setNewKemasanBeratGram(""); setEditingKemasanId(null);
    await fetchPresetKemasan(produkId);
    if (bahanBakuRefList.length === 0) await fetchBahanBakuRef();
  };

  const simpanKemasan = async (produkId: number) => {
    if (!newKemasanBahanId) return showToast("Pilih bahan kemasan!", "error");
    if (!newKemasanBeratGram || parseFloat(newKemasanBeratGram) <= 0) return showToast("Isi berat gram!", "error");
    setSavingKemasan(true);
    const { error } = await supabase.from("produk_kemasan_default").insert([{ stok_barang_id: produkId, bahan_baku_id: parseInt(newKemasanBahanId), berat_gram: parseFloat(newKemasanBeratGram) }]);
    if (error) showToast("Gagal simpan: " + error.message, "error");
    else { showToast("✓ Preset kemasan disimpan!"); setNewKemasanBahanId(""); setNewKemasanBeratGram(""); await fetchPresetKemasan(produkId); }
    setSavingKemasan(false);
  };

  const updateKemasan = async (kemasanId: number, produkId: number) => {
    if (!editKemasanBerat || parseFloat(editKemasanBerat) <= 0) return showToast("Isi berat!", "error");
    const { error } = await supabase.from("produk_kemasan_default").update({ berat_gram: parseFloat(editKemasanBerat) }).eq("id", kemasanId);
    if (error) showToast("Gagal update: " + error.message, "error");
    else { showToast("✓ Kemasan diupdate!"); setEditingKemasanId(null); await fetchPresetKemasan(produkId); }
  };

  const hapusKemasan = async (kemasanId: number, produkId: number) => {
    const { error } = await supabase.from("produk_kemasan_default").delete().eq("id", kemasanId);
    if (error) showToast("Gagal hapus: " + error.message, "error");
    else { showToast("🗑 Kemasan dihapus"); await fetchPresetKemasan(produkId); }
  };

  const bahanByKategori = bahanBakuRefList.reduce<Record<string, BahanBakuRef[]>>((acc, b) => {
    const cat = b.kategori || "Lainnya";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(b);
    return acc;
  }, {});

  const produkFiltered = produkList.filter(p =>
    searchProduk === "" ||
    p.nama_produk?.toLowerCase().includes(searchProduk.toLowerCase()) ||
    (p.sku || "").toLowerCase().includes(searchProduk.toLowerCase())
  );

  return (
    <div style={{ animation: "fadeUp 0.3s ease" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: C.text }}>Master Produk</h2>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: C.muted, fontFamily: C.fontMono }}>{produkList.length} produk · {produkList.filter(p => p.sku).length} punya SKU</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <input value={searchProduk} onChange={e => setSearchProduk(e.target.value)} placeholder="🔍 Cari..." style={{ ...inputStyle, width: 200 }} />
          <button onClick={() => { setShowTambah(v => !v); setTambah(emptyForm()); setEditingId(null); }} style={{ padding: "9px 18px", background: showTambah ? "transparent" : `linear-gradient(135deg, ${C.accentDark}, ${C.accent})`, border: showTambah ? `1px solid ${C.border}` : "none", color: showTambah ? C.muted : "#fff", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: C.fontSans, whiteSpace: "nowrap" }}>
            {showTambah ? "✕ Tutup" : "+ Tambah Produk"}
          </button>
        </div>
      </div>

      {showTambah && (
        <div style={{ background: `${C.accent}06`, border: `1px solid ${C.accent}30`, borderRadius: 14, padding: 24, marginBottom: 20, animation: "slideDown 0.2s ease" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.accent, fontFamily: C.fontMono, marginBottom: 16, letterSpacing: 1 }}>+ PRODUK BARU</div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div><Label C={C}>NAMA PRODUK *</Label><input value={tambah.nama_produk} onChange={e => setTambah(p => ({ ...p, nama_produk: e.target.value }))} placeholder="Nama produk" style={inputStyle} autoFocus /></div>
            <div><Label C={C}>SKU</Label><input value={tambah.sku} onChange={e => setTambah(p => ({ ...p, sku: e.target.value }))} placeholder="SKU-001" style={{ ...inputStyle, fontFamily: C.fontMono, textTransform: "uppercase" }} /></div>
            <div><Label C={C}>HARGA JUAL *</Label><input value={tambah.harga_jual} onChange={e => setTambah(p => ({ ...p, harga_jual: formatIDR(e.target.value) }))} placeholder="0" style={{ ...inputStyle, fontFamily: C.fontMono }} /></div>
            <div><Label C={C}>STOK AWAL</Label><input type="number" value={tambah.jumlah_stok} onChange={e => setTambah(p => ({ ...p, jumlah_stok: e.target.value }))} style={{ ...inputStyle, fontFamily: C.fontMono }} /></div>
            <div><Label C={C}>SATUAN</Label><select value={tambah.satuan} onChange={e => setTambah(p => ({ ...p, satuan: e.target.value }))} style={{ ...inputStyle, cursor: "pointer" }}>{SATUAN_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
            <div><Label C={C}>BERAT (kg)</Label><input type="number" value={tambah.berat_kg} onChange={e => setTambah(p => ({ ...p, berat_kg: e.target.value }))} placeholder="0.25" step="0.001" style={{ ...inputStyle, fontFamily: C.fontMono }} /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 12, marginBottom: 16 }}>
            <div><Label C={C}>STOK MINIMUM</Label><input type="number" value={tambah.stok_minimum} onChange={e => setTambah(p => ({ ...p, stok_minimum: e.target.value }))} placeholder="0" style={{ ...inputStyle, fontFamily: C.fontMono }} /></div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleTambah} disabled={saving} style={{ padding: "9px 20px", background: `linear-gradient(135deg, ${C.accentDark}, ${C.accent})`, border: "none", color: "#fff", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: C.fontMono, opacity: saving ? 0.6 : 1 }}>{saving ? "Menyimpan..." : "✓ Simpan Produk"}</button>
            <button onClick={() => setShowTambah(false)} style={{ padding: "9px 16px", background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 8, cursor: "pointer", fontSize: 12, fontFamily: C.fontMono }}>Batal</button>
          </div>
        </div>
      )}

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 0.8fr 0.8fr 1fr 0.7fr 0.7fr 0.8fr 150px", gap: 8, padding: "10px 24px", borderBottom: `1px solid ${C.border}`, background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)" }}>
          {["PRODUK", "SKU", "STOK", "HARGA JUAL", "SATUAN", "MIN", "BERAT", "AKSI"].map(h => (
            <div key={h} style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1.5, fontWeight: 700 }}>{h}</div>
          ))}
        </div>
        {loading && <div style={{ padding: 40, textAlign: "center", color: C.muted, fontFamily: C.fontMono }}>Memuat...</div>}
        {!loading && produkFiltered.length === 0 && <div style={{ padding: 40, textAlign: "center", color: C.muted, fontFamily: C.fontMono }}>Belum ada produk</div>}
        {!loading && produkFiltered.map(p => {
          const stokKritis = p.stok_minimum != null && p.jumlah_stok <= p.stok_minimum;
          return (
            <div key={p.id} style={{ borderBottom: `1px solid ${kemasanPanel === p.id ? C.purple + "40" : C.border}`, transition: "border-color 0.2s" }}>
              {editingId !== p.id ? (
                <>
                  <div className="data-row" style={{ display: "grid", gridTemplateColumns: "2fr 0.8fr 0.8fr 1fr 0.7fr 0.7fr 0.8fr 150px", gap: 8, padding: "12px 24px", alignItems: "center", transition: "background 0.15s", background: stokKritis ? (isDark ? "rgba(248,113,113,0.05)" : "rgba(248,113,113,0.04)") : "transparent" }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.textMid, display: "flex", alignItems: "center", gap: 6 }}>
                      {stokKritis && <span title="Stok di bawah minimum">🔴</span>}
                      {p.nama_produk}
                    </div>
                    <div style={{ fontSize: 11, color: p.sku ? C.yellow : C.muted, fontFamily: C.fontMono }}>{p.sku || "—"}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: p.jumlah_stok <= 0 ? C.red : stokKritis ? C.yellow : C.green, fontFamily: C.fontMono }}>{p.jumlah_stok}</div>
                    <div style={{ fontSize: 12, color: C.textMid, fontFamily: C.fontMono }}>{rupiahFmt(p.harga_jual)}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>{p.satuan}</div>
                    <div style={{ fontSize: 12, color: p.stok_minimum != null && p.stok_minimum > 0 ? C.orange : C.muted, fontFamily: C.fontMono, fontWeight: p.stok_minimum != null && p.stok_minimum > 0 ? 700 : 400 }}>
                      {p.stok_minimum != null && p.stok_minimum > 0 ? p.stok_minimum : "—"}
                    </div>
                    <div style={{ fontSize: 12, color: p.berat_kg ? C.blue : C.muted, fontFamily: C.fontMono }}>{p.berat_kg != null ? `${p.berat_kg} kg` : "—"}</div>
                    <div style={{ display: "flex", gap: 5 }}>
                      {confirmDeleteId === p.id ? (
                        <>
                          <button onClick={() => handleHapus(p.id, p.nama_produk)} disabled={deletingId === p.id} style={{ background: C.red, border: "none", color: "#fff", padding: "5px 8px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: C.fontMono, fontWeight: 700 }}>{deletingId === p.id ? "..." : "Hapus"}</button>
                          <button onClick={() => setConfirmDeleteId(null)} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, padding: "5px 7px", borderRadius: 6, cursor: "pointer", fontSize: 11 }}>✕</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => bukaKemasan(p.id)} style={{ background: kemasanPanel === p.id ? `${C.purple}30` : `${C.purple}10`, border: `1px solid ${C.purple}40`, color: C.purple, padding: "5px 8px", borderRadius: 6, cursor: "pointer", fontSize: 10, fontFamily: C.fontMono, fontWeight: 700, whiteSpace: "nowrap" }}>🎁 {kemasanPanel === p.id ? "▲" : "▼"}</button>
                          <button className="btn-edit" onClick={() => { setEditingId(p.id); setEditForm({ nama_produk: p.nama_produk, sku: p.sku || "", harga_jual: formatIDR(String(p.harga_jual)), jumlah_stok: String(p.jumlah_stok), satuan: p.satuan, berat_kg: p.berat_kg != null ? String(p.berat_kg) : "", stok_minimum: p.stok_minimum != null && p.stok_minimum > 0 ? String(p.stok_minimum) : "" }); setShowTambah(false); setKemasanPanel(null); }} style={{ background: `${C.accent}15`, border: `1px solid ${C.accent}30`, color: C.accent, padding: "5px 8px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: C.fontMono, fontWeight: 700 }}>Edit</button>
                          <button className="btn-del" onClick={() => setConfirmDeleteId(p.id)} style={{ background: `${C.red}15`, border: `1px solid ${C.red}25`, color: C.red, padding: "5px 8px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: C.fontMono, fontWeight: 700 }}>🗑</button>
                        </>
                      )}
                    </div>
                  </div>
                  {kemasanPanel === p.id && (
                    <div style={{ borderTop: `1px solid ${C.purple}30`, background: isDark ? "rgba(167,139,250,0.03)" : "rgba(167,139,250,0.05)", padding: "16px 24px", animation: "slideDown 0.2s ease" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C.purple, fontFamily: C.fontMono, letterSpacing: 1, marginBottom: 14 }}>
                        🎁 PRESET KEMASAN — {p.nama_produk}
                      </div>
                      {kemasanLoading ? <div style={{ color: C.muted, fontFamily: C.fontMono, fontSize: 12, marginBottom: 12 }}>Memuat...</div>
                        : kemasanList.length === 0 ? <div style={{ color: C.muted, fontFamily: C.fontMono, fontSize: 12, marginBottom: 12, fontStyle: "italic" }}>Belum ada preset kemasan</div>
                        : (
                          <div style={{ marginBottom: 14 }}>
                            {kemasanList.map(k => (
                              <div key={k.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: `1px solid ${C.border}` }}>
                                <div style={{ flex: 1, fontSize: 12, color: C.textMid, fontWeight: 600 }}>{k.nama_bahan || `Bahan #${k.bahan_baku_id}`} <span style={{ fontSize: 10, color: C.muted }}>({k.satuan_bahan})</span></div>
                                {editingKemasanId === k.id ? (
                                  <>
                                    <input type="number" value={editKemasanBerat} onChange={e => setEditKemasanBerat(e.target.value)} placeholder="gram" step="0.1" style={{ ...inputStyle, width: 100, fontFamily: C.fontMono, fontSize: 12 }} autoFocus onKeyDown={e => e.key === "Enter" && updateKemasan(k.id, p.id)} />
                                    <button onClick={() => updateKemasan(k.id, p.id)} style={{ padding: "5px 12px", background: C.green + "20", border: `1px solid ${C.green}40`, color: C.green, borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: C.fontMono, fontWeight: 700 }}>✓</button>
                                    <button onClick={() => setEditingKemasanId(null)} style={{ padding: "5px 8px", background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 6, cursor: "pointer", fontSize: 11 }}>✕</button>
                                  </>
                                ) : (
                                  <>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: C.orange, fontFamily: C.fontMono, minWidth: 80, textAlign: "right" }}>{k.berat_gram} gr</div>
                                    <button onClick={() => { setEditingKemasanId(k.id); setEditKemasanBerat(String(k.berat_gram)); }} style={{ padding: "4px 10px", background: `${C.accent}15`, border: `1px solid ${C.accent}30`, color: C.accent, borderRadius: 5, cursor: "pointer", fontSize: 10, fontFamily: C.fontMono, fontWeight: 700 }}>Edit</button>
                                    <button onClick={() => hapusKemasan(k.id, p.id)} style={{ padding: "4px 8px", background: `${C.red}15`, border: `1px solid ${C.red}25`, color: C.red, borderRadius: 5, cursor: "pointer", fontSize: 10, fontFamily: C.fontMono, fontWeight: 700 }}>🗑</button>
                                  </>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                        <div style={{ flex: 2 }}>
                          <Label C={C}>BAHAN KEMASAN {bahanBakuRefLoading ? "(memuat...)" : ""}</Label>
                          <select value={newKemasanBahanId} onChange={e => setNewKemasanBahanId(e.target.value)} style={{ ...inputStyle, fontSize: 12, cursor: "pointer" }}>
                            <option value="">— Pilih Bahan —</option>
                            {Object.entries(bahanByKategori).map(([kat, items]) => (
                              <optgroup key={kat} label={kat}>
                                {items.filter(b => !kemasanList.some(k => k.bahan_baku_id === b.id)).map(b => (
                                  <option key={b.id} value={b.id}>{b.nama} ({b.satuan})</option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                        </div>
                        <div style={{ flex: 1 }}>
                          <Label C={C}>BERAT (gram)</Label>
                          <input type="number" value={newKemasanBeratGram} onChange={e => setNewKemasanBeratGram(e.target.value)} placeholder="0" step="0.1" style={{ ...inputStyle, fontFamily: C.fontMono, fontSize: 12 }} onKeyDown={e => e.key === "Enter" && simpanKemasan(p.id)} />
                        </div>
                        <button onClick={() => simpanKemasan(p.id)} disabled={savingKemasan} style={{ padding: "8px 16px", background: `linear-gradient(135deg, #7c3aed, ${C.purple})`, border: "none", color: "#fff", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: C.fontMono, whiteSpace: "nowrap", marginBottom: 1 }}>
                          {savingKemasan ? "..." : "+ Simpan"}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div style={{ padding: "14px 24px", background: isDark ? "rgba(167,139,250,0.04)" : "rgba(167,139,250,0.05)" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr", gap: 10, marginBottom: 8 }}>
                    <input value={editForm.nama_produk} onChange={e => setEditForm(f => ({ ...f, nama_produk: e.target.value }))} placeholder="Nama produk" style={inputStyle} autoFocus />
                    <input value={editForm.sku} onChange={e => setEditForm(f => ({ ...f, sku: e.target.value }))} placeholder="SKU" style={{ ...inputStyle, fontFamily: C.fontMono, textTransform: "uppercase" }} />
                    <input value={editForm.harga_jual} onChange={e => setEditForm(f => ({ ...f, harga_jual: formatIDR(e.target.value) }))} placeholder="Harga" style={{ ...inputStyle, fontFamily: C.fontMono }} />
                    <input type="number" value={editForm.jumlah_stok} onChange={e => setEditForm(f => ({ ...f, jumlah_stok: e.target.value }))} placeholder="Stok" style={{ ...inputStyle, fontFamily: C.fontMono }} />
                    <select value={editForm.satuan} onChange={e => setEditForm(f => ({ ...f, satuan: e.target.value }))} style={{ ...inputStyle, cursor: "pointer" }}>{SATUAN_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}</select>
                    <input type="number" value={editForm.berat_kg} onChange={e => setEditForm(f => ({ ...f, berat_kg: e.target.value }))} placeholder="0.25" step="0.001" style={{ ...inputStyle, fontFamily: C.fontMono }} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 10, marginBottom: 12 }}>
                    <div>
                      <Label C={C}>STOK MINIMUM</Label>
                      <input type="number" value={editForm.stok_minimum} onChange={e => setEditForm(f => ({ ...f, stok_minimum: e.target.value }))} placeholder="Min stok" style={{ ...inputStyle, fontFamily: C.fontMono }} />
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => handleEdit(p.id)} disabled={savingEdit} style={{ padding: "8px 18px", background: `linear-gradient(135deg, #7c3aed, ${C.purple})`, border: "none", color: "#fff", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: C.fontMono }}>{savingEdit ? "..." : "✓ Simpan"}</button>
                    <button onClick={() => setEditingId(null)} style={{ padding: "9px 16px", background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 8, cursor: "pointer", fontSize: 12, fontFamily: C.fontMono }}>Batal</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 16, background: `${C.purple}08`, border: `1px solid ${C.purple}20`, borderRadius: 10, padding: "14px 20px", fontSize: 12, color: C.purple, fontFamily: C.fontMono }}>
        📦 <strong>SKU</strong> sesuai kolom SKU Induk di Excel Shopee. &nbsp;·&nbsp; ⚖ <strong>Berat</strong> wajib diisi untuk HPP produksi. &nbsp;·&nbsp; 🎁 <strong>Preset Kemasan</strong> auto pre-fill di form produksi. &nbsp;·&nbsp; 🔴 <strong>Stok Minimum</strong> → notif Telegram otomatis setiap hari jam 07:00.
      </div>
    </div>
  );
}
