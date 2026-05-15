"use client";
import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Profile, Toast, ROLES, roleInfo, tanggalFmt } from "./adminTypes";

interface Props {
  currentUserId?: string;
  C: any;
  isDark: boolean;
  showToast: (msg: string, type?: Toast["type"]) => void;
}

export default function UsersTab({ currentUserId, C, isDark, showToast }: Props) {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState("");
  const [editNama, setEditNama] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const inputStyle: React.CSSProperties = {
    padding: "8px 12px", background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
    border: `1.5px solid ${C.border}`, borderRadius: 8, color: C.text,
    fontFamily: C.fontSans, fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box",
  };

  const fetchUsers = useCallback(async () => {
    const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
    if (error) showToast("Gagal load users: " + error.message, "error");
    else setUsers(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const saveUser = async (id: string) => {
    if (!editRole) return showToast("Pilih role!", "error");
    if (!editNama.trim()) return showToast("Isi nama!", "error");
    if (id === currentUserId) {
      const ownerCount = users.filter(u => u.role === "owner" || u.role === "super_admin").length;
      if (ownerCount <= 1 && editRole !== "owner" && editRole !== "super_admin")
        return showToast("Tidak bisa mengubah role — kamu satu-satunya owner!", "error");
    }
    setSavingId(id);
    const { error } = await supabase.from("profiles").update({ role: editRole, nama: editNama.trim() }).eq("id", id);
    if (error) showToast("Gagal update: " + error.message, "error");
    else { showToast("User berhasil diupdate!"); fetchUsers(); setEditingId(null); }
    setSavingId(null);
  };

  const usersFiltered = users.filter(u =>
    search === "" ||
    u.nama?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase()) ||
    u.role?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: C.muted, fontFamily: C.fontMono }}>Memuat...</div>;

  return (
    <div style={{ animation: "fadeUp 0.3s ease" }}>
      {/* Role cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        {ROLES.map(r => (
          <div key={r.value} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 16px", borderLeft: `3px solid ${r.color}` }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: r.color, fontFamily: C.fontMono, marginBottom: 3 }}>{r.label}</div>
            <div style={{ fontSize: 11, color: C.muted }}>{r.desc}</div>
          </div>
        ))}
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
        <div style={{ padding: "16px 24px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: C.text }}>Daftar User ({users.length})</h3>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Cari..." style={{ ...inputStyle, width: 240 }} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 160px 120px 100px", gap: 8, padding: "10px 24px", borderBottom: `1px solid ${C.border}`, background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)" }}>
          {["NAMA", "EMAIL", "ROLE", "BERGABUNG", "AKSI"].map(h => (
            <div key={h} style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1.5, fontWeight: 700 }}>{h}</div>
          ))}
        </div>
        {usersFiltered.map(user => {
          const isEditing = editingId === user.id;
          const rInfo = roleInfo(user.role);
          return (
            <div key={user.id} style={{ borderBottom: `1px solid ${C.border}`, background: isEditing ? `${C.accent}08` : "transparent" }}>
              {!isEditing ? (
                <div className="data-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 160px 120px 100px", gap: 8, padding: "13px 24px", alignItems: "center", transition: "background 0.15s" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: "50%", background: `${rInfo.color}25`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: rInfo.color, fontFamily: C.fontMono, flexShrink: 0 }}>
                      {(user.nama || user.email || "?")[0].toUpperCase()}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.textMid }}>{user.nama || "—"}</div>
                  </div>
                  <div style={{ fontSize: 12, color: C.muted, fontFamily: C.fontMono }}>{user.email}</div>
                  <div><span style={{ padding: "3px 10px", borderRadius: 20, background: `${rInfo.color}20`, color: rInfo.color, fontSize: 11, fontWeight: 700, fontFamily: C.fontMono }}>{rInfo.label}</span></div>
                  <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>{tanggalFmt(user.created_at)}</div>
                  <button className="btn-edit" onClick={() => { setEditingId(user.id); setEditRole(user.role); setEditNama(user.nama || ""); }}
                    style={{ background: `${C.accent}15`, border: `1px solid ${C.accent}30`, color: C.accent, padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: C.fontMono, fontWeight: 700 }}>
                    Edit
                  </button>
                </div>
              ) : (
                <div style={{ padding: "16px 24px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, marginBottom: 5, textTransform: "uppercase" as const }}>NAMA</div>
                      <input value={editNama} onChange={e => setEditNama(e.target.value)} style={inputStyle} />
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, marginBottom: 5, textTransform: "uppercase" as const }}>ROLE</div>
                      <select value={editRole} onChange={e => setEditRole(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                        {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => saveUser(user.id)} disabled={savingId === user.id}
                      style={{ padding: "8px 18px", background: `linear-gradient(135deg, ${C.accentDark}, ${C.accent})`, border: "none", color: "#fff", borderRadius: 7, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: C.fontMono }}>
                      {savingId === user.id ? "..." : "Simpan"}
                    </button>
                    <button onClick={() => setEditingId(null)}
                      style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, padding: "8px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontFamily: C.fontMono }}>
                      Batal
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 16, background: `${C.blue}10`, border: `1px solid ${C.blue}25`, borderRadius: 10, padding: "14px 20px", fontSize: 12, color: C.blue, fontFamily: C.fontMono }}>
        ℹ Tambah user baru via <strong>Supabase Dashboard → Authentication → Users → Invite</strong>.
      </div>
    </div>
  );
}
