"use client";
import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { PluBorongan, VarianBorongan, Karyawan, Toast, rupiahFmt } from "../adminTypes";

interface Props {
  C: any;
  isDark: boolean;
  showToast: (msg: string, type?: Toast["type"]) => void;
}

export default function MasterPLUTab({ C, isDark, showToast }: Props) {
  const [pluList, setPluList] = useState<PluBorongan[]>([]);
  const [varianList, setVarianList] = useState<VarianBorongan[]>([]);
  const [karyawanList, setKaryawanList] = useState<Karyawan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTambah, setShowTambah] = useState(false);
  const [tambahNomorPlu, setTambahNomorPlu] = useState("");
  const [tambahKaryawanId, setTambahKaryawanId] = useState("");
  const [tambahVarianId, setTambahVarianId] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editKaryawanId, setEditKaryawanId] = useState("");
  const [editVarianId, setEditVarianId] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [confirmHapusId, setConfirmHapusId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [searchKaryawan, setSearchKaryawan] = useState("");

  const inputStyle: React.CSSProperties = {
    padding: "8px 12px", background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
    border: `1.5px solid ${C.border}`, borderRadius: 8, color: C.text,
    fontFamily: C.fontSans, fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box",
  };

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [resPlu, resVarian, resKaryawan] = await Promise.all([
      supabase.from("plu_borongan")
        .select("*, karyawan(nama), varian_borongan(nama, tarif_per_kg)")
        .order("nomor_plu"),
      supabase.from("varian_borongan").select("*").eq("aktif", true).order("nama"),
      supabase.from("karyawan").select("id, nama, tipe, status").eq("status", "Aktif").order("nama"),
    ]);
    if (resPlu.error) showToast("Gagal load PLU: " + resPlu.error.message, "error");
    else setPluList((resPlu.data || []).map((r: any) => ({
      ...r,
      nama_karyawan: r.karyawan?.nama,
      nama_varian: r.varian_borongan?.nama,
      tarif_per_kg: r.varian_borongan?.tarif_per_kg,
    })));
    if (resVarian.error) showToast("Gagal load varian: " + resVarian.error.message, "error");
    else setVarianList(resVarian.data || []);
    if (resKaryawan.error) showToast("Gagal load karyawan: " + resKaryawan.error.message, "error");
    else setKaryawanList(resKaryawan.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleTambah = async () => {
    if (!tambahNomorPlu || parseInt(tambahNomorPlu) <= 0) return showToast("Isi nomor PLU!", "error");
    if (!tambahKaryawanId) return showToast("Pilih karyawan!", "error");
    if (!tambahVarianId) return showToast("Pilih varian!", "error");
    // Cek duplikat
    const existing = pluList.find(p => p.nomor_plu === parseInt(tambahNomorPlu));
    if (existing) return showToast(`PLU ${tambahNomorPlu} sudah dipakai oleh ${existing.nama_karyawan}!`, "error");
    setSaving(true);
    const { error } = await supabase.from("plu_borongan").insert([{
      nomor_plu: parseInt(tambahNomorPlu),
      karyawan_id: parseInt(tambahKaryawanId),
      varian_id: parseInt(tambahVarianId),
      aktif: true,
    }]);
    if (error) showToast("Gagal tambah PLU: " + error.message, "error");
    else {
      showToast(`✓ PLU ${tambahNomorPlu} ditambahkan!`);
      setTambahNomorPlu(""); setTambahKaryawanId(""); setTambahVarianId("");
      setShowTambah(false);
      fetchAll();
    }
    setSaving(false);
  };

  const handleEdit = async (id: number) => {
    if (!editKaryawanId) return showToast("Pilih karyawan!", "error");
    if (!editVarianId) return showToast("Pilih varian!", "error");
    setSavingEdit(true);
    const { error } = await supabase.from("plu_borongan").update({
      karyawan_id: parseInt(editKaryawanId),
      varian_id: parseInt(editVarianId),
    }).eq("id", id);
    if (error) showToast("Gagal update: " + error.message, "error");
    else { showToast("✓ PLU diupdate!"); setEditingId(null); fetchAll(); }
    setSavingEdit(false);
  };

  const handleHapus = async (id: number, nomor: number) => {
    setDeletingId(id);
    const { error } = await supabase.from("plu_borongan").update({ aktif: false }).eq("id", id);
    if (error) showToast("Gagal hapus: " + error.message, "error");
    else { showToast(`🗑 PLU ${nomor} dinonaktifkan`); setConfirmHapusId(null); fetchAll(); }
    setDeletingId(null);
  };

  const toggleAktif = async (id: number, aktif: boolean) => {
    const { error } = await supabase.from("plu_borongan").update({ aktif: !aktif }).eq("id", id);
    if (error) showToast("Gagal update: " + error.message, "error");
    else { showToast(`PLU ${!aktif ? "diaktifkan" : "dinonaktifkan"}`); fetchAll(); }
  };

  // Group PLU by karyawan
  const pluFiltered = pluList.filter(p =>
    searchKaryawan === "" || p.nama_karyawan?.toLowerCase().includes(searchKaryawan.toLowerCase())
  );

  const karyawanPencetak = karyawanList.filter(k => k.tipe === "Pencetak");

  return (
    <div style={{ animation: "fadeUp 0.3s ease" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: C.text }}>Master PLU Borongan</h2>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: C.muted, fontFamily: C.fontMono }}>
            {pluList.filter(p => p.aktif).length} PLU aktif · {pluList.length} total
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <input value={searchKaryawan} onChange={e => setSearchKaryawan(e.target.value)} placeholder="🔍 Cari karyawan..." style={{ ...inputStyle, width: 180 }} />
          <button onClick={() => { setShowTambah(v => !v); setTambahNomorPlu(""); setTambahKaryawanId(""); setTambahVarianId(""); }}
            style={{ padding: "9px 18px", background: showTambah ? "transparent" : `linear-gradient(135deg, ${C.accentDark}, ${C.accent})`, border: showTambah ? `1px solid ${C.border}` : "none", color: showTambah ? C.muted : "#fff", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: C.fontSans, whiteSpace: "nowrap" }}>
            {showTambah ? "✕ Tutup" : "+ Tambah PLU"}
          </button>
        </div>
      </div>

      {/* Info */}
      <div style={{ background: `${C.blue}10`, border: `1px solid ${C.blue}25`, borderRadius: 10, padding: "12px 16px", marginBottom: 20, fontSize: 12, color: C.blue, fontFamily: C.fontMono }}>
        📋 1 karyawan punya <strong>2 PLU</strong> — satu per varian (Kuncup & Besar). Total 17 karyawan = 34 PLU.
        Nomor PLU harus unik dan sesuai yang diset di timbangan Digi.
      </div>

      {/* Form Tambah */}
      {showTambah && (
        <div style={{ background: `${C.accent}08`, border: `1px solid ${C.accent}30`, borderRadius: 14, padding: 24, marginBottom: 20, animation: "slideDown 0.2s ease" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.accent, fontFamily: C.fontMono, marginBottom: 16, letterSpacing: 1 }}>+ PLU BARU</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr", gap: 12, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, marginBottom: 5, textTransform: "uppercase" as const }}>NO. PLU *</div>
              <input type="number" min="1" value={tambahNomorPlu} onChange={e => setTambahNomorPlu(e.target.value)} placeholder="01" style={{ ...inputStyle, fontFamily: C.fontMono, fontWeight: 700 }} autoFocus />
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, marginBottom: 5, textTransform: "uppercase" as const }}>KARYAWAN *</div>
              <select value={tambahKaryawanId} onChange={e => setTambahKaryawanId(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                <option value="">— Pilih Karyawan —</option>
                {karyawanPencetak.map(k => (
                  <option key={k.id} value={k.id}>{k.nama}</option>
                ))}
                {karyawanPencetak.length === 0 && karyawanList.map(k => (
                  <option key={k.id} value={k.id}>{k.nama} ({k.tipe})</option>
                ))}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, marginBottom: 5, textTransform: "uppercase" as const }}>VARIAN *</div>
              <select value={tambahVarianId} onChange={e => setTambahVarianId(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                <option value="">— Pilih Varian —</option>
                {varianList.map(v => (
                  <option key={v.id} value={v.id}>{v.nama} — {rupiahFmt(v.tarif_per_kg)}/kg</option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleTambah} disabled={saving}
              style={{ padding: "9px 20px", background: saving ? C.muted : `linear-gradient(135deg, ${C.accentDark}, ${C.accent})`, border: "none", color: "#fff", borderRadius: 8, cursor: saving ? "not-allowed" : "pointer", fontWeight: 700, fontSize: 13, fontFamily: C.fontMono, opacity: saving ? 0.6 : 1 }}>
              {saving ? "Menyimpan..." : "✓ Simpan PLU"}
            </button>
            <button onClick={() => setShowTambah(false)}
              style={{ padding: "9px 16px", background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 8, cursor: "pointer", fontSize: 12, fontFamily: C.fontMono }}>
              Batal
            </button>
          </div>
        </div>
      )}

      {/* Tabel PLU */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "80px 2fr 1.5fr 1fr 100px 160px", gap: 8, padding: "10px 24px", borderBottom: `1px solid ${C.border}`, background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)" }}>
          {["PLU", "KARYAWAN", "VARIAN", "TARIF/KG", "STATUS", "AKSI"].map(h => (
            <div key={h} style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1.5, fontWeight: 700 }}>{h}</div>
          ))}
        </div>

        {loading && <div style={{ padding: 40, textAlign: "center", color: C.muted, fontFamily: C.fontMono }}>Memuat...</div>}
        {!loading && pluFiltered.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: C.muted, fontFamily: C.fontMono }}>
            {searchKaryawan ? "Karyawan tidak ditemukan" : "Belum ada PLU — tambah dulu!"}
          </div>
        )}

        {!loading && pluFiltered.map(p => (
          <div key={p.id} style={{ borderBottom: `1px solid ${C.border}`, background: editingId === p.id ? `${C.accent}06` : "transparent", opacity: p.aktif ? 1 : 0.5 }}>
            {editingId !== p.id ? (
              <div className="data-row" style={{ display: "grid", gridTemplateColumns: "80px 2fr 1.5fr 1fr 100px 160px", gap: 8, padding: "12px 24px", alignItems: "center", transition: "background 0.15s" }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: C.accent, fontFamily: C.fontMono }}>
                  {String(p.nomor_plu).padStart(2, "0")}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{p.nama_karyawan || `Karyawan #${p.karyawan_id}`}</div>
                <div>
                  <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: `${C.purple}20`, color: C.purple, fontWeight: 700, fontFamily: C.fontMono }}>
                    {p.nama_varian || `Varian #${p.varian_id}`}
                  </span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.green, fontFamily: C.fontMono }}>
                  {p.tarif_per_kg ? rupiahFmt(p.tarif_per_kg) : "—"}
                </div>
                <div>
                  <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 20, background: p.aktif ? `${C.green}20` : `${C.red}20`, color: p.aktif ? C.green : C.red, fontWeight: 700, fontFamily: C.fontMono }}>
                    {p.aktif ? "Aktif" : "Nonaktif"}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 5 }}>
                  {confirmHapusId === p.id ? (
                    <>
                      <button onClick={() => handleHapus(p.id, p.nomor_plu)} disabled={deletingId === p.id}
                        style={{ background: C.red, border: "none", color: "#fff", padding: "5px 8px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: C.fontMono, fontWeight: 700 }}>
                        {deletingId === p.id ? "..." : "Hapus"}
                      </button>
                      <button onClick={() => setConfirmHapusId(null)}
                        style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, padding: "5px 7px", borderRadius: 6, cursor: "pointer", fontSize: 11 }}>✕</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => toggleAktif(p.id, p.aktif)}
                        style={{ padding: "5px 8px", background: p.aktif ? `${C.red}10` : `${C.green}10`, border: `1px solid ${p.aktif ? C.red : C.green}25`, color: p.aktif ? C.red : C.green, borderRadius: 6, cursor: "pointer", fontSize: 10, fontFamily: C.fontMono, fontWeight: 700, whiteSpace: "nowrap" }}>
                        {p.aktif ? "Nonaktif" : "Aktifkan"}
                      </button>
                      <button className="btn-edit" onClick={() => { setEditingId(p.id); setEditKaryawanId(String(p.karyawan_id)); setEditVarianId(String(p.varian_id)); }}
                        style={{ background: `${C.accent}15`, border: `1px solid ${C.accent}30`, color: C.accent, padding: "5px 8px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: C.fontMono, fontWeight: 700 }}>Edit</button>
                      <button className="btn-del" onClick={() => setConfirmHapusId(p.id)}
                        style={{ background: `${C.red}15`, border: `1px solid ${C.red}25`, color: C.red, padding: "5px 8px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: C.fontMono, fontWeight: 700 }}>🗑</button>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ padding: "14px 24px" }}>
                <div style={{ fontSize: 12, color: C.muted, fontFamily: C.fontMono, marginBottom: 12 }}>PLU <strong style={{ color: C.accent }}>{String(p.nomor_plu).padStart(2, "0")}</strong></div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, marginBottom: 5, textTransform: "uppercase" as const }}>KARYAWAN</div>
                    <select value={editKaryawanId} onChange={e => setEditKaryawanId(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                      {karyawanPencetak.map(k => <option key={k.id} value={k.id}>{k.nama}</option>)}
                      {karyawanPencetak.length === 0 && karyawanList.map(k => <option key={k.id} value={k.id}>{k.nama}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, marginBottom: 5, textTransform: "uppercase" as const }}>VARIAN</div>
                    <select value={editVarianId} onChange={e => setEditVarianId(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                      {varianList.map(v => <option key={v.id} value={v.id}>{v.nama} — {rupiahFmt(v.tarif_per_kg)}/kg</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => handleEdit(p.id)} disabled={savingEdit}
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

      {/* Summary per karyawan */}
      {!loading && pluList.length > 0 && (
        <div style={{ marginTop: 16, background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 14 }}>📊 Rekap PLU per Karyawan</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
            {Array.from(new Set(pluList.map(p => p.karyawan_id))).map(kId => {
              const pluKaryawan = pluList.filter(p => p.karyawan_id === kId);
              const nama = pluKaryawan[0]?.nama_karyawan || `Karyawan #${kId}`;
              return (
                <div key={kId} style={{ background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)", borderRadius: 10, padding: "10px 14px", border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 6 }}>{nama}</div>
                  {pluKaryawan.map(p => (
                    <div key={p.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>
                      <span>PLU {String(p.nomor_plu).padStart(2, "0")} · {p.nama_varian}</span>
                      <span style={{ color: p.aktif ? C.green : C.red }}>{p.aktif ? "✓" : "✗"}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
