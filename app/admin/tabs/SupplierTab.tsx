"use client";
import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Supplier, Toast } from "../adminTypes";

interface Props { C: any; isDark: boolean; showToast: (msg: string, type?: Toast["type"]) => void; }
type SupplierForm = { nama: string; telepon: string; alamat: string; catatan: string };
const emptyForm = (): SupplierForm => ({ nama: "", telepon: "", alamat: "", catatan: "" });

export default function SupplierTab({ C, isDark, showToast }: Props) {
  const [supplierList, setSupplierList] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchSupplier, setSearchSupplier] = useState("");
  const [showTambah, setShowTambah] = useState(false);
  const [tambah, setTambah] = useState<SupplierForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<SupplierForm>(emptyForm());
  const [savingEdit, setSavingEdit] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const inputStyle: React.CSSProperties = {
    padding: "8px 12px", background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
    border: `1.5px solid ${C.border}`, borderRadius: 8, color: C.text,
    fontFamily: C.fontSans, fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box",
  };

  const fetchSupplier = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("supplier").select("*").order("nama");
    if (error) showToast("Gagal load supplier: " + error.message, "error");
    else setSupplierList(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchSupplier(); }, [fetchSupplier]);

  const handleTambah = async () => {
    if (!tambah.nama.trim()) return showToast("Nama supplier wajib diisi!", "error");
    setSaving(true);
    const { error } = await supabase.from("supplier").insert([{ nama: tambah.nama.trim(), telepon: tambah.telepon.trim() || null, alamat: tambah.alamat.trim() || null, catatan: tambah.catatan.trim() || null }]);
    if (error) showToast("Gagal tambah supplier: " + error.message, "error");
    else { showToast(`✓ Supplier "${tambah.nama}" ditambahkan!`); setTambah(emptyForm()); setShowTambah(false); fetchSupplier(); }
    setSaving(false);
  };

  const handleEdit = async (id: number) => {
    if (!editForm.nama.trim()) return showToast("Nama supplier wajib diisi!", "error");
    setSavingEdit(true);
    const { error } = await supabase.from("supplier").update({ nama: editForm.nama.trim(), telepon: editForm.telepon.trim() || null, alamat: editForm.alamat.trim() || null, catatan: editForm.catatan.trim() || null }).eq("id", id);
    if (error) showToast("Gagal update supplier: " + error.message, "error");
    else { showToast("✓ Supplier berhasil diupdate!"); setEditingId(null); fetchSupplier(); }
    setSavingEdit(false);
  };

  const handleHapus = async (id: number, nama: string) => {
    setDeletingId(id);
    const { error } = await supabase.from("supplier").delete().eq("id", id);
    if (error) showToast("Gagal hapus supplier: " + error.message, "error");
    else { showToast(`🗑 Supplier "${nama}" dihapus`); setConfirmDeleteId(null); fetchSupplier(); }
    setDeletingId(null);
  };

  const supplierFiltered = supplierList.filter(s =>
    searchSupplier === "" ||
    s.nama?.toLowerCase().includes(searchSupplier.toLowerCase()) ||
    (s.telepon || "").includes(searchSupplier)
  );

  return (
    <div style={{ animation: "fadeUp 0.3s ease" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: C.text }}>Master Supplier</h2>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: C.muted, fontFamily: C.fontMono }}>{supplierList.length} supplier terdaftar</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <input value={searchSupplier} onChange={e => setSearchSupplier(e.target.value)} placeholder="🔍 Cari nama atau telepon..." style={{ ...inputStyle, width: 220 }} />
          <button onClick={() => { setShowTambah(v => !v); setTambah(emptyForm()); setEditingId(null); }} style={{ padding: "9px 18px", background: showTambah ? "transparent" : `linear-gradient(135deg, ${C.accentDark}, ${C.accent})`, border: showTambah ? `1px solid ${C.border}` : "none", color: showTambah ? C.muted : "#fff", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: C.fontSans, whiteSpace: "nowrap" }}>
            {showTambah ? "✕ Batal" : "+ Tambah Supplier"}
          </button>
        </div>
      </div>

      {showTambah && (
        <div style={{ background: `${C.accent}06`, border: `1px solid ${C.accent}30`, borderRadius: 14, padding: 24, marginBottom: 20, animation: "slideDown 0.2s ease" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.accent, fontFamily: C.fontMono, marginBottom: 16, letterSpacing: 1 }}>+ TAMBAH SUPPLIER BARU</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, marginBottom: 5, textTransform: "uppercase" as const }}>NAMA SUPPLIER *</div>
              <input value={tambah.nama} onChange={e => setTambah(f => ({ ...f, nama: e.target.value }))} placeholder="CV Bahan Segar" style={inputStyle} autoFocus />
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, marginBottom: 5, textTransform: "uppercase" as const }}>NO. TELEPON</div>
              <input value={tambah.telepon} onChange={e => setTambah(f => ({ ...f, telepon: e.target.value }))} placeholder="08xx-xxxx-xxxx" style={{ ...inputStyle, fontFamily: C.fontMono }} />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, marginBottom: 5, textTransform: "uppercase" as const }}>ALAMAT</div>
            <input value={tambah.alamat} onChange={e => setTambah(f => ({ ...f, alamat: e.target.value }))} placeholder="Alamat lengkap" style={inputStyle} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, marginBottom: 5, textTransform: "uppercase" as const }}>CATATAN</div>
            <textarea value={tambah.catatan} onChange={e => setTambah(f => ({ ...f, catatan: e.target.value }))} placeholder="Opsional" rows={2} style={{ ...inputStyle, fontFamily: C.fontSans }} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleTambah} disabled={saving} style={{ padding: "9px 20px", background: `linear-gradient(135deg, ${C.accentDark}, ${C.accent})`, border: "none", color: "#fff", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: C.fontMono, opacity: saving ? 0.6 : 1 }}>{saving ? "Menyimpan..." : "✓ Simpan Supplier"}</button>
            <button onClick={() => setShowTambah(false)} style={{ padding: "9px 16px", background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 8, cursor: "pointer", fontSize: 12, fontFamily: C.fontMono }}>Batal</button>
          </div>
        </div>
      )}

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1.5fr 1fr 120px", gap: 8, padding: "10px 24px", borderBottom: `1px solid ${C.border}`, background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)" }}>
          {["NAMA", "TELEPON", "ALAMAT", "CATATAN", "AKSI"].map(h => <div key={h} style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1.5, fontWeight: 700 }}>{h}</div>)}
        </div>
        {loading && <div style={{ padding: 40, textAlign: "center", color: C.muted, fontFamily: C.fontMono }}>Memuat...</div>}
        {!loading && supplierFiltered.length === 0 && <div style={{ padding: 40, textAlign: "center", color: C.muted, fontFamily: C.fontMono }}>Belum ada supplier</div>}
        {!loading && supplierFiltered.map(s => (
          <div key={s.id} className="data-row" style={{ borderBottom: `1px solid ${C.border}`, background: editingId === s.id ? `${C.blue}05` : "transparent", transition: "background 0.15s" }}>
            {editingId !== s.id ? (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1.5fr 1fr 120px", gap: 8, padding: "13px 24px", alignItems: "center" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.textMid }}>{s.nama}</div>
                  <div style={{ fontSize: 12, color: s.telepon ? C.blue : C.muted, fontFamily: C.fontMono }}>{s.telepon || "—"}</div>
                  <div style={{ fontSize: 12, color: C.muted }}>{s.alamat || "—"}</div>
                  <div style={{ fontSize: 12, color: C.muted }}>{s.catatan || "—"}</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn-edit" onClick={() => { setEditingId(s.id); setEditForm({ nama: s.nama, telepon: s.telepon || "", alamat: s.alamat || "", catatan: s.catatan || "" }); setShowTambah(false); setConfirmDeleteId(null); }} style={{ background: `${C.accent}15`, border: `1px solid ${C.accent}30`, color: C.accent, padding: "5px 10px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: C.fontMono, fontWeight: 700 }}>Edit</button>
                    <button className="btn-del" onClick={() => setConfirmDeleteId(confirmDeleteId === s.id ? null : s.id)} style={{ background: `${C.red}15`, border: `1px solid ${C.red}25`, color: C.red, padding: "5px 10px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: C.fontMono, fontWeight: 700 }}>Hapus</button>
                  </div>
                </div>
                {confirmDeleteId === s.id && (
                  <div style={{ padding: "10px 24px 14px", background: `${C.red}08`, borderTop: `1px solid ${C.red}20`, display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: 12, color: C.red, fontFamily: C.fontMono }}>⚠ Hapus supplier "{s.nama}"?</span>
                    <button onClick={() => handleHapus(s.id, s.nama)} disabled={deletingId === s.id} style={{ background: C.red, border: "none", color: "#fff", padding: "6px 14px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontFamily: C.fontMono, fontWeight: 700 }}>{deletingId === s.id ? "..." : "Ya, Hapus"}</button>
                    <button onClick={() => setConfirmDeleteId(null)} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, padding: "6px 10px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontFamily: C.fontMono }}>Batal</button>
                  </div>
                )}
              </>
            ) : (
              <div style={{ padding: "14px 24px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                  <input value={editForm.nama} onChange={e => setEditForm(f => ({ ...f, nama: e.target.value }))} placeholder="Nama supplier *" style={inputStyle} autoFocus />
                  <input value={editForm.telepon} onChange={e => setEditForm(f => ({ ...f, telepon: e.target.value }))} placeholder="Telepon" style={{ ...inputStyle, fontFamily: C.fontMono }} />
                </div>
                <input value={editForm.alamat} onChange={e => setEditForm(f => ({ ...f, alamat: e.target.value }))} placeholder="Alamat" style={{ ...inputStyle, marginBottom: 10 }} />
                <textarea value={editForm.catatan} onChange={e => setEditForm(f => ({ ...f, catatan: e.target.value }))} placeholder="Catatan" rows={2} style={{ ...inputStyle, marginBottom: 12, fontFamily: C.fontSans }} />
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => handleEdit(s.id)} disabled={savingEdit} style={{ padding: "9px 20px", background: `linear-gradient(135deg, ${C.accentDark}, ${C.accent})`, border: "none", color: "#fff", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: C.fontMono }}>{savingEdit ? "..." : "✓ Simpan"}</button>
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
