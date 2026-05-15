"use client";
import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Toko, Toast, PLATFORM_OPTIONS, PLATFORM_COLORS } from "../adminTypes";

interface Props { C: any; isDark: boolean; showToast: (msg: string, type?: Toast["type"]) => void; }
type TokoForm = { nama: string; platform: string; aktif: boolean };
const emptyForm = (): TokoForm => ({ nama: "", platform: "Shopee", aktif: true });

export default function TokoTab({ C, isDark, showToast }: Props) {
  const [tokoList, setTokoList] = useState<Toko[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTambah, setShowTambah] = useState(false);
  const [tambah, setTambah] = useState<TokoForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<TokoForm>(emptyForm());
  const [savingEdit, setSavingEdit] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const inputStyle: React.CSSProperties = {
    padding: "8px 12px", background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
    border: `1.5px solid ${C.border}`, borderRadius: 8, color: C.text,
    fontFamily: C.fontSans, fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box",
  };

  const fetchToko = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("toko_online").select("*").order("id");
    if (error) showToast("Gagal load toko: " + error.message, "error");
    else setTokoList(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchToko(); }, [fetchToko]);

  const handleTambah = async () => {
    if (!tambah.nama.trim()) return showToast("Nama toko wajib diisi!", "error");
    setSaving(true);
    const { error } = await supabase.from("toko_online").insert([{ nama: tambah.nama.trim(), platform: tambah.platform, aktif: tambah.aktif }]);
    if (error) showToast("Gagal tambah toko: " + error.message, "error");
    else { showToast(`✓ Toko "${tambah.nama}" ditambahkan!`); setTambah(emptyForm()); setShowTambah(false); fetchToko(); }
    setSaving(false);
  };

  const handleEdit = async (id: number) => {
    if (!editForm.nama.trim()) return showToast("Nama toko wajib diisi!", "error");
    setSavingEdit(true);
    const { error } = await supabase.from("toko_online").update({ nama: editForm.nama.trim(), platform: editForm.platform, aktif: editForm.aktif }).eq("id", id);
    if (error) showToast("Gagal update toko: " + error.message, "error");
    else { showToast("✓ Toko berhasil diupdate!"); setEditingId(null); fetchToko(); }
    setSavingEdit(false);
  };

  const handleHapus = async (id: number, nama: string) => {
    setDeletingId(id);
    const { error } = await supabase.from("toko_online").delete().eq("id", id);
    if (error) showToast("Gagal hapus toko: " + error.message, "error");
    else { showToast(`🗑 Toko "${nama}" dihapus`); setConfirmDeleteId(null); fetchToko(); }
    setDeletingId(null);
  };

  const toggleAktif = async (id: number, aktif: boolean) => {
    const { error } = await supabase.from("toko_online").update({ aktif: !aktif }).eq("id", id);
    if (error) showToast("Gagal update status: " + error.message, "error");
    else { showToast(`Toko ${!aktif ? "diaktifkan" : "dinonaktifkan"}`); fetchToko(); }
  };

  const StatusBtn = ({ val, current, onChange }: { val: boolean; current: boolean; onChange: () => void }) => (
    <button onClick={onChange} style={{ flex: 1, padding: "8px", border: `1px solid ${current === val ? (val ? C.green : C.red) : C.border}40`, borderRadius: 8, background: current === val ? (val ? `${C.green}15` : `${C.red}15`) : "transparent", color: current === val ? (val ? C.green : C.red) : C.muted, cursor: "pointer", fontSize: 12, fontFamily: C.fontSans, fontWeight: 600 }}>
      {val ? "Aktif" : "Nonaktif"}
    </button>
  );

  return (
    <div style={{ animation: "fadeUp 0.3s ease" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: C.text }}>Master Toko Online</h2>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: C.muted, fontFamily: C.fontMono }}>{tokoList.length} toko · {tokoList.filter(t => t.aktif).length} aktif</p>
        </div>
        <button onClick={() => { setShowTambah(v => !v); setTambah(emptyForm()); setEditingId(null); }} style={{ padding: "9px 18px", background: showTambah ? "transparent" : `linear-gradient(135deg, ${C.accentDark}, ${C.accent})`, border: showTambah ? `1px solid ${C.border}` : "none", color: showTambah ? C.muted : "#fff", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: C.fontSans, whiteSpace: "nowrap" }}>
          {showTambah ? "✕ Batal" : "+ Tambah Toko"}
        </button>
      </div>

      {showTambah && (
        <div style={{ background: `${C.accent}06`, border: `1px solid ${C.accent}30`, borderRadius: 14, padding: 24, marginBottom: 20, animation: "slideDown 0.2s ease" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.accent, fontFamily: C.fontMono, marginBottom: 16, letterSpacing: 1 }}>+ TOKO BARU</div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, marginBottom: 5, textTransform: "uppercase" as const }}>NAMA TOKO *</div>
              <input value={tambah.nama} onChange={e => setTambah(f => ({ ...f, nama: e.target.value }))} placeholder="Nama toko" style={inputStyle} autoFocus />
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, marginBottom: 5, textTransform: "uppercase" as const }}>PLATFORM</div>
              <select value={tambah.platform} onChange={e => setTambah(f => ({ ...f, platform: e.target.value }))} style={{ ...inputStyle, cursor: "pointer" }}>
                {PLATFORM_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, marginBottom: 5, textTransform: "uppercase" as const }}>STATUS</div>
              <div style={{ display: "flex", gap: 8 }}>
                <StatusBtn val={true} current={tambah.aktif} onChange={() => setTambah(f => ({ ...f, aktif: true }))} />
                <StatusBtn val={false} current={tambah.aktif} onChange={() => setTambah(f => ({ ...f, aktif: false }))} />
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleTambah} disabled={saving} style={{ padding: "9px 20px", background: `linear-gradient(135deg, ${C.accentDark}, ${C.accent})`, border: "none", color: "#fff", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: C.fontMono, opacity: saving ? 0.6 : 1 }}>{saving ? "Menyimpan..." : "✓ Simpan Toko"}</button>
            <button onClick={() => setShowTambah(false)} style={{ padding: "9px 16px", background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 8, cursor: "pointer", fontSize: 12, fontFamily: C.fontMono }}>Batal</button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {loading && <div style={{ padding: 40, textAlign: "center", color: C.muted, fontFamily: C.fontMono }}>Memuat...</div>}
        {!loading && tokoList.length === 0 && <div style={{ padding: 40, textAlign: "center", color: C.muted, fontFamily: C.fontMono }}>Belum ada toko</div>}
        {!loading && tokoList.map(t => (
          <div key={t.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
            {editingId !== t.id ? (
              <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 20px" }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: `${PLATFORM_COLORS[t.platform] || C.muted}20`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>🏪</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{t.nama}</div>
                  <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12, background: `${PLATFORM_COLORS[t.platform] || C.muted}20`, color: PLATFORM_COLORS[t.platform] || C.muted, fontWeight: 600 }}>{t.platform}</span>
                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12, background: t.aktif ? `${C.green}15` : `${C.red}15`, color: t.aktif ? C.green : C.red, fontWeight: 600 }}>{t.aktif ? "Aktif" : "Nonaktif"}</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => toggleAktif(t.id, t.aktif)} style={{ padding: "6px 12px", background: t.aktif ? `${C.red}15` : `${C.green}15`, border: `1px solid ${t.aktif ? C.red : C.green}30`, color: t.aktif ? C.red : C.green, borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: C.fontMono, fontWeight: 600 }}>{t.aktif ? "Nonaktifkan" : "Aktifkan"}</button>
                  <button className="btn-edit" onClick={() => { setEditingId(t.id); setEditForm({ nama: t.nama, platform: t.platform, aktif: t.aktif }); setShowTambah(false); }} style={{ background: `${C.accent}15`, border: `1px solid ${C.accent}30`, color: C.accent, padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: C.fontMono, fontWeight: 700 }}>Edit</button>
                  {confirmDeleteId === t.id ? (
                    <>
                      <button onClick={() => handleHapus(t.id, t.nama)} disabled={deletingId === t.id} style={{ background: C.red, border: "none", color: "#fff", padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: C.fontMono, fontWeight: 700 }}>{deletingId === t.id ? "..." : "Hapus"}</button>
                      <button onClick={() => setConfirmDeleteId(null)} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, padding: "6px 8px", borderRadius: 6, cursor: "pointer", fontSize: 11 }}>✕</button>
                    </>
                  ) : (
                    <button className="btn-del" onClick={() => setConfirmDeleteId(t.id)} style={{ background: `${C.red}15`, border: `1px solid ${C.red}25`, color: C.red, padding: "6px 10px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: C.fontMono, fontWeight: 700 }}>🗑</button>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ padding: "16px 20px", background: isDark ? "rgba(167,139,250,0.04)" : "rgba(167,139,250,0.03)" }}>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, marginBottom: 5, textTransform: "uppercase" as const }}>NAMA TOKO</div>
                    <input value={editForm.nama} onChange={e => setEditForm(f => ({ ...f, nama: e.target.value }))} style={inputStyle} autoFocus />
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, marginBottom: 5, textTransform: "uppercase" as const }}>PLATFORM</div>
                    <select value={editForm.platform} onChange={e => setEditForm(f => ({ ...f, platform: e.target.value }))} style={{ ...inputStyle, cursor: "pointer" }}>
                      {PLATFORM_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, marginBottom: 5, textTransform: "uppercase" as const }}>STATUS</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <StatusBtn val={true} current={editForm.aktif} onChange={() => setEditForm(f => ({ ...f, aktif: true }))} />
                      <StatusBtn val={false} current={editForm.aktif} onChange={() => setEditForm(f => ({ ...f, aktif: false }))} />
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => handleEdit(t.id)} disabled={savingEdit} style={{ flex: 1, padding: "9px", background: `linear-gradient(135deg, #7c3aed, ${C.accent})`, border: "none", color: "#fff", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: C.fontMono }}>{savingEdit ? "..." : "✓ Simpan"}</button>
                  <button onClick={() => setEditingId(null)} style={{ padding: "9px 14px", background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 8, cursor: "pointer", fontSize: 12, fontFamily: C.fontMono }}>Batal</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
