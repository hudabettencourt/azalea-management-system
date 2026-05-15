"use client";
import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Toast, rupiahFmt, formatIDR, toAngka, tanggalFmt } from "../adminTypes";

interface Props { C: any; isDark: boolean; showToast: (msg: string, type?: Toast["type"]) => void; }

type Karyawan = {
  id: number;
  nama: string;
  tipe: string;
  tarif_harian: number | null;
  tarif_borongan: number | null;
  gaji_bulanan: number | null;
  status: string;
  catatan: string | null;
  created_at: string;
  fee_live_sesi: number | null;
  komisi_live_persen: number | null;
};

type KaryawanForm = {
  nama: string;
  tipe: string;
  tarif_harian: string;
  tarif_borongan: string;
  gaji_bulanan: string;
  catatan: string;
  fee_live_sesi: string;
  komisi_live_persen: string;
};

const TIPE_OPTIONS = [
  { value: "Operator Produksi", label: "Operator Produksi", color: "#34d399", group: "HPP" },
  { value: "Packing", label: "Packing", color: "#34d399", group: "HPP" },
  { value: "Pencetak", label: "Pencetak", color: "#34d399", group: "HPP" },
  { value: "Host Live", label: "Host Live", color: "#a78bfa", group: "Operasional" },
  { value: "Packing Online", label: "Packing Online", color: "#60a5fa", group: "Operasional" },
  { value: "Admin Shopee", label: "Admin Shopee", color: "#f97316", group: "Operasional" },
  { value: "Owner", label: "Owner", color: "#f87171", group: "Operasional" },
];

const emptyForm = (): KaryawanForm => ({
  nama: "", tipe: "Operator Produksi",
  tarif_harian: "", tarif_borongan: "",
  gaji_bulanan: "", catatan: "",
  fee_live_sesi: "", komisi_live_persen: "",
});

const tipeInfo = (tipe: string) => TIPE_OPTIONS.find(t => t.value === tipe) || { color: "#7c6d8a", group: "Lainnya", label: tipe, value: tipe };

export default function KaryawanTab({ C, isDark, showToast }: Props) {
  const [karyawanList, setKaryawanList] = useState<Karyawan[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchKaryawan, setSearchKaryawan] = useState("");
  const [filterTipe, setFilterTipe] = useState("Semua");
  const [filterStatus, setFilterStatus] = useState("Aktif");
  const [showTambah, setShowTambah] = useState(false);
  const [tambah, setTambah] = useState<KaryawanForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<KaryawanForm>(emptyForm());
  const [savingEdit, setSavingEdit] = useState(false);
  const [confirmNonaktifId, setConfirmNonaktifId] = useState<number | null>(null);

  const inputStyle: React.CSSProperties = {
    padding: "8px 12px", background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
    border: `1.5px solid ${C.border}`, borderRadius: 8, color: C.text,
    fontFamily: C.fontSans, fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box",
  };

  const fetchKaryawan = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("karyawan").select("*").order("tipe").order("nama");
    if (error) showToast("Gagal load karyawan: " + error.message, "error");
    else setKaryawanList(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchKaryawan(); }, [fetchKaryawan]);

  const buildPayload = (f: KaryawanForm) => ({
    nama: f.nama.trim(),
    tipe: f.tipe,
    tarif_harian: toAngka(f.tarif_harian) || null,
    tarif_borongan: toAngka(f.tarif_borongan) || null,
    gaji_bulanan: toAngka(f.gaji_bulanan) || null,
    catatan: f.catatan.trim() || null,
    fee_live_sesi: toAngka(f.fee_live_sesi) || null,
    komisi_live_persen: f.komisi_live_persen ? parseFloat(f.komisi_live_persen) : null,
  });

  const handleTambah = async () => {
    if (!tambah.nama.trim()) return showToast("Nama karyawan wajib diisi!", "error");
    if (!tambah.tipe) return showToast("Pilih tipe karyawan!", "error");
    setSaving(true);
    const { error } = await supabase.from("karyawan").insert([{ ...buildPayload(tambah), status: "Aktif" }]);
    if (error) showToast("Gagal tambah karyawan: " + error.message, "error");
    else { showToast(`✓ Karyawan "${tambah.nama}" ditambahkan!`); setTambah(emptyForm()); setShowTambah(false); fetchKaryawan(); }
    setSaving(false);
  };

  const handleEdit = async (id: number) => {
    if (!editForm.nama.trim()) return showToast("Nama karyawan wajib diisi!", "error");
    setSavingEdit(true);
    const { error } = await supabase.from("karyawan").update(buildPayload(editForm)).eq("id", id);
    if (error) showToast("Gagal update karyawan: " + error.message, "error");
    else { showToast("✓ Karyawan berhasil diupdate!"); setEditingId(null); fetchKaryawan(); }
    setSavingEdit(false);
  };

  const toggleStatus = async (id: number, status: string) => {
    const newStatus = status === "Aktif" ? "Nonaktif" : "Aktif";
    const { error } = await supabase.from("karyawan").update({ status: newStatus }).eq("id", id);
    if (error) showToast("Gagal update status: " + error.message, "error");
    else { showToast(`Karyawan ${newStatus === "Aktif" ? "diaktifkan" : "dinonaktifkan"}`); setConfirmNonaktifId(null); fetchKaryawan(); }
  };

  const karyawanFiltered = karyawanList.filter(k => {
    const matchSearch = searchKaryawan === "" || k.nama.toLowerCase().includes(searchKaryawan.toLowerCase());
    const matchTipe = filterTipe === "Semua" || k.tipe === filterTipe;
    const matchStatus = filterStatus === "Semua" || k.status === filterStatus;
    return matchSearch && matchTipe && matchStatus;
  });

  // Group by tipe untuk summary
  const hppTypes = ["Operator Produksi", "Packing", "Pencetak"];
  const totalAktif = karyawanList.filter(k => k.status === "Aktif").length;
  const totalHPP = karyawanList.filter(k => k.status === "Aktif" && hppTypes.includes(k.tipe)).length;
  const totalOps = karyawanList.filter(k => k.status === "Aktif" && !hppTypes.includes(k.tipe)).length;

  // Form fields berdasarkan tipe
  const showBorongan = (tipe: string) => tipe === "Pencetak";
  const showHarian = (tipe: string) => ["Operator Produksi", "Packing", "Packing Online"].includes(tipe);
  const showBulanan = (tipe: string) => ["Host Live", "Admin Shopee", "Owner"].includes(tipe);
  const showLive = (tipe: string) => tipe === "Host Live";

  const FormFields = ({ form, setForm }: { form: KaryawanForm; setForm: (f: KaryawanForm) => void }) => (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, marginBottom: 5, textTransform: "uppercase" as const }}>NAMA KARYAWAN *</div>
          <input value={form.nama} onChange={e => setForm({ ...form, nama: e.target.value })} placeholder="Nama lengkap" style={inputStyle} autoFocus />
        </div>
        <div>
          <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, marginBottom: 5, textTransform: "uppercase" as const }}>TIPE *</div>
          <select value={form.tipe} onChange={e => setForm({ ...form, tipe: e.target.value })} style={{ ...inputStyle, cursor: "pointer" }}>
            <optgroup label="HPP (Biaya Produksi)">
              {TIPE_OPTIONS.filter(t => t.group === "HPP").map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </optgroup>
            <optgroup label="Operasional">
              {TIPE_OPTIONS.filter(t => t.group === "Operasional").map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </optgroup>
          </select>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 12 }}>
        {showBorongan(form.tipe) && (
  <div style={{ gridColumn: "1 / -1", padding: "10px 14px", background: `${C.green}10`, border: `1px solid ${C.green}25`, borderRadius: 8, fontSize: 12, color: C.green, fontFamily: C.fontMono }}>
    ⚖ Tarif borongan Pencetak ditentukan dari <strong>Varian Borongan</strong> (tab Master PLU). 
    Atur PLU karyawan ini di tab <strong>Master PLU</strong>.
  </div>
)}
        {showHarian(form.tipe) && (
          <div>
            <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, marginBottom: 5, textTransform: "uppercase" as const }}>TARIF HARIAN (Rp/hari)</div>
            <input value={form.tarif_harian} onChange={e => setForm({ ...form, tarif_harian: formatIDR(e.target.value) })} placeholder="0" style={{ ...inputStyle, fontFamily: C.fontMono }} />
          </div>
        )}
        {showBulanan(form.tipe) && (
          <div>
            <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, marginBottom: 5, textTransform: "uppercase" as const }}>GAJI BULANAN (Rp)</div>
            <input value={form.gaji_bulanan} onChange={e => setForm({ ...form, gaji_bulanan: formatIDR(e.target.value) })} placeholder="0" style={{ ...inputStyle, fontFamily: C.fontMono }} />
          </div>
        )}
        {showLive(form.tipe) && (
          <>
            <div>
              <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, marginBottom: 5, textTransform: "uppercase" as const }}>FEE PER SESI LIVE</div>
              <input value={form.fee_live_sesi} onChange={e => setForm({ ...form, fee_live_sesi: formatIDR(e.target.value) })} placeholder="0" style={{ ...inputStyle, fontFamily: C.fontMono }} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, marginBottom: 5, textTransform: "uppercase" as const }}>KOMISI LIVE (%)</div>
              <input type="number" value={form.komisi_live_persen} onChange={e => setForm({ ...form, komisi_live_persen: e.target.value })} placeholder="0" step="0.1" min="0" max="100" style={{ ...inputStyle, fontFamily: C.fontMono }} />
            </div>
          </>
        )}
      </div>

      <div>
        <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, marginBottom: 5, textTransform: "uppercase" as const }}>CATATAN</div>
        <input value={form.catatan} onChange={e => setForm({ ...form, catatan: e.target.value })} placeholder="Opsional" style={inputStyle} />
      </div>

      {/* Info beban */}
      <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 8, background: hppTypes.includes(form.tipe) ? `${C.green}10` : `${C.blue}10`, border: `1px solid ${hppTypes.includes(form.tipe) ? C.green : C.blue}25`, fontSize: 11, color: hppTypes.includes(form.tipe) ? C.green : C.blue, fontFamily: C.fontMono }}>
        {hppTypes.includes(form.tipe)
          ? "⚙ Tipe HPP — gaji masuk ke biaya produksi (COGS)"
          : "💼 Tipe Operasional — gaji masuk ke beban operasional"}
      </div>
    </>
  );

  return (
    <div style={{ animation: "fadeUp 0.3s ease" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: C.text }}>Master Karyawan</h2>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: C.muted, fontFamily: C.fontMono }}>
            {totalAktif} aktif · {totalHPP} HPP · {totalOps} Operasional
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <input value={searchKaryawan} onChange={e => setSearchKaryawan(e.target.value)} placeholder="🔍 Cari nama..." style={{ ...inputStyle, width: 180 }} />
          <button onClick={() => { setShowTambah(v => !v); setTambah(emptyForm()); setEditingId(null); }}
            style={{ padding: "9px 18px", background: showTambah ? "transparent" : `linear-gradient(135deg, ${C.accentDark}, ${C.accent})`, border: showTambah ? `1px solid ${C.border}` : "none", color: showTambah ? C.muted : "#fff", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: C.fontSans, whiteSpace: "nowrap" }}>
            {showTambah ? "✕ Tutup" : "+ Tambah Karyawan"}
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 20 }}>
        {[
          { label: "Total Aktif", value: totalAktif, color: C.green, icon: "👥" },
          { label: "HPP (Produksi)", value: totalHPP, color: C.blue, icon: "⚙️" },
          { label: "Operasional", value: totalOps, color: C.purple, icon: "💼" },
          { label: "Nonaktif", value: karyawanList.filter(k => k.status !== "Aktif").length, color: C.muted, icon: "🔴" },
        ].map((s, i) => (
          <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px" }}>
            <div style={{ fontSize: 16, marginBottom: 6 }}>{s.icon}</div>
            <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color, fontFamily: C.fontMono }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Form tambah */}
      {showTambah && (
        <div style={{ background: `${C.accent}06`, border: `1px solid ${C.accent}30`, borderRadius: 14, padding: 24, marginBottom: 20, animation: "slideDown 0.2s ease" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.accent, fontFamily: C.fontMono, marginBottom: 16, letterSpacing: 1 }}>+ KARYAWAN BARU</div>
          <FormFields form={tambah} setForm={setTambah} />
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button onClick={handleTambah} disabled={saving}
              style={{ padding: "9px 20px", background: `linear-gradient(135deg, ${C.accentDark}, ${C.accent})`, border: "none", color: "#fff", borderRadius: 8, cursor: saving ? "not-allowed" : "pointer", fontWeight: 700, fontSize: 13, fontFamily: C.fontMono, opacity: saving ? 0.6 : 1 }}>
              {saving ? "Menyimpan..." : "✓ Simpan Karyawan"}
            </button>
            <button onClick={() => setShowTambah(false)}
              style={{ padding: "9px 16px", background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 8, cursor: "pointer", fontSize: 12, fontFamily: C.fontMono }}>
              Batal
            </button>
          </div>
        </div>
      )}

      {/* Filter */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 6 }}>
          {["Aktif", "Nonaktif", "Semua"].map(s => (
            <button key={s} onClick={() => setFilterStatus(s)} style={{ padding: "5px 14px", borderRadius: 20, border: `1px solid ${filterStatus === s ? C.accent + "60" : C.border}`, background: filterStatus === s ? `${C.accent}15` : "transparent", color: filterStatus === s ? C.accent : C.muted, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: C.fontSans }}>
              {s}
            </button>
          ))}
        </div>
        <div style={{ width: 1, background: C.border }} />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {["Semua", ...TIPE_OPTIONS.map(t => t.value)].map(t => (
            <button key={t} onClick={() => setFilterTipe(t)} style={{ padding: "5px 12px", borderRadius: 20, border: `1px solid ${filterTipe === t ? (tipeInfo(t).color || C.accent) + "60" : C.border}`, background: filterTipe === t ? (tipeInfo(t).color || C.accent) + "15" : "transparent", color: filterTipe === t ? (tipeInfo(t).color || C.accent) : C.muted, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: C.fontSans }}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* List karyawan */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {loading && <div style={{ padding: 40, textAlign: "center", color: C.muted, fontFamily: C.fontMono }}>Memuat...</div>}
        {!loading && karyawanFiltered.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: C.muted, fontFamily: C.fontMono }}>
            {searchKaryawan ? "Tidak ditemukan" : "Belum ada karyawan"}
          </div>
        )}

        {!loading && karyawanFiltered.map(k => {
          const tInfo = tipeInfo(k.tipe);
          const isHPP = hppTypes.includes(k.tipe);
          return (
            <div key={k.id} style={{ background: C.card, border: `1px solid ${editingId === k.id ? C.accent + "40" : C.border}`, borderRadius: 12, overflow: "hidden", opacity: k.status !== "Aktif" ? 0.6 : 1, transition: "all 0.15s" }}>
              {editingId !== k.id ? (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 20px" }}>
                    {/* Avatar */}
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: `${tInfo.color}20`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800, color: tInfo.color, fontFamily: C.fontMono, flexShrink: 0 }}>
                      {k.nama[0].toUpperCase()}
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{k.nama}</span>
                        {k.status !== "Aktif" && <span style={{ fontSize: 10, background: `${C.red}20`, color: C.red, padding: "2px 7px", borderRadius: 10, fontFamily: C.fontMono, fontWeight: 700 }}>NONAKTIF</span>}
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: `${tInfo.color}20`, color: tInfo.color, fontWeight: 700, fontFamily: C.fontMono }}>{k.tipe}</span>
                        <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: isHPP ? `${C.green}10` : `${C.blue}10`, color: isHPP ? C.green : C.blue, fontFamily: C.fontMono }}>{isHPP ? "HPP" : "Operasional"}</span>
                      </div>
                    </div>

                    {/* Tarif */}
                    <div style={{ textAlign: "right", minWidth: 140 }}>
                      {k.tarif_borongan && <div style={{ fontSize: 13, fontWeight: 700, color: C.green, fontFamily: C.fontMono }}>{rupiahFmt(k.tarif_borongan)}<span style={{ fontSize: 10, fontWeight: 400, color: C.muted }}>/kg</span></div>}
                      {k.tarif_harian && <div style={{ fontSize: 13, fontWeight: 700, color: C.yellow, fontFamily: C.fontMono }}>{rupiahFmt(k.tarif_harian)}<span style={{ fontSize: 10, fontWeight: 400, color: C.muted }}>/hari</span></div>}
                      {k.gaji_bulanan && <div style={{ fontSize: 13, fontWeight: 700, color: C.purple, fontFamily: C.fontMono }}>{rupiahFmt(k.gaji_bulanan)}<span style={{ fontSize: 10, fontWeight: 400, color: C.muted }}>/bulan</span></div>}
                      {k.fee_live_sesi && <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>{rupiahFmt(k.fee_live_sesi)}/sesi</div>}
                      {k.komisi_live_persen && <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>{k.komisi_live_persen}% komisi live</div>}
                      {!k.tarif_borongan && !k.tarif_harian && !k.gaji_bulanan && (
                        <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono, fontStyle: "italic" }}>Belum diset</div>
                      )}
                    </div>

                    {/* Aksi */}
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button onClick={() => { setEditingId(k.id); setEditForm({ nama: k.nama, tipe: k.tipe, tarif_harian: k.tarif_harian ? formatIDR(String(k.tarif_harian)) : "", tarif_borongan: k.tarif_borongan ? formatIDR(String(k.tarif_borongan)) : "", gaji_bulanan: k.gaji_bulanan ? formatIDR(String(k.gaji_bulanan)) : "", catatan: k.catatan || "", fee_live_sesi: k.fee_live_sesi ? formatIDR(String(k.fee_live_sesi)) : "", komisi_live_persen: k.komisi_live_persen ? String(k.komisi_live_persen) : "" }); setShowTambah(false); }}
                        style={{ background: `${C.accent}15`, border: `1px solid ${C.accent}30`, color: C.accent, padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: C.fontMono, fontWeight: 700 }}>
                        Edit
                      </button>
                      {confirmNonaktifId === k.id ? (
                        <>
                          <button onClick={() => toggleStatus(k.id, k.status)}
                            style={{ background: k.status === "Aktif" ? C.red : C.green, border: "none", color: "#fff", padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: C.fontMono, fontWeight: 700 }}>
                            {k.status === "Aktif" ? "Nonaktifkan" : "Aktifkan"}
                          </button>
                          <button onClick={() => setConfirmNonaktifId(null)}
                            style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, padding: "6px 8px", borderRadius: 6, cursor: "pointer", fontSize: 11 }}>✕</button>
                        </>
                      ) : (
                        <button onClick={() => setConfirmNonaktifId(k.id)}
                          style={{ background: k.status === "Aktif" ? `${C.red}10` : `${C.green}10`, border: `1px solid ${k.status === "Aktif" ? C.red : C.green}25`, color: k.status === "Aktif" ? C.red : C.green, padding: "6px 10px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: C.fontMono, fontWeight: 600 }}>
                          {k.status === "Aktif" ? "Nonaktifkan" : "Aktifkan"}
                        </button>
                      )}
                    </div>
                  </div>

                  {k.catatan && (
                    <div style={{ padding: "0 20px 12px", fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>
                      📝 {k.catatan}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ padding: "16px 20px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.accent, fontFamily: C.fontMono, marginBottom: 16, letterSpacing: 1 }}>✏️ EDIT — {k.nama}</div>
                  <FormFields form={editForm} setForm={setEditForm} />
                  <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                    <button onClick={() => handleEdit(k.id)} disabled={savingEdit}
                      style={{ padding: "9px 20px", background: `linear-gradient(135deg, ${C.accentDark}, ${C.accent})`, border: "none", color: "#fff", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: C.fontMono, opacity: savingEdit ? 0.6 : 1 }}>
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
          );
        })}
      </div>

      {/* Info */}
      <div style={{ marginTop: 16, background: `${C.blue}08`, border: `1px solid ${C.blue}20`, borderRadius: 10, padding: "14px 20px", fontSize: 12, color: C.blue, fontFamily: C.fontMono }}>
        ⚙ <strong>HPP</strong>: Operator Produksi, Packing, Pencetak → gaji masuk biaya produksi. &nbsp;·&nbsp;
        💼 <strong>Operasional</strong>: Host Live, Packing Online, Admin Shopee, Owner → gaji masuk beban operasional.
      </div>
    </div>
  );
}
