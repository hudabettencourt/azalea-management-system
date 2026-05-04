"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPass, setShowPass] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) { setError("Email dan password harus diisi!"); return; }
    setLoading(true); setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError("Email atau password salah. Coba lagi."); setLoading(false); return; }
    router.push("/dashboard");
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #100c16; }
        input:focus { outline: none; border-color: rgba(232,115,138,0.6) !important; box-shadow: 0 0 0 3px rgba(232,115,138,0.1) !important; }
        input { color: #f0e6e9 !important; }
        input::placeholder { color: #5a4860 !important; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes float { 0%,100% { transform: translateY(0px) rotate(0deg); } 50% { transform: translateY(-12px) rotate(3deg); } }
        @keyframes pulse { 0%,100% { opacity: 0.4; transform: scale(1); } 50% { opacity: 0.7; transform: scale(1.05); } }
      `}</style>

      <div style={{ minHeight: "100vh", background: "#100c16", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif", padding: 20, position: "relative", overflow: "hidden" }}>

        <div style={{ position: "fixed", top: "-20%", right: "-10%", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle, rgba(232,115,138,0.08) 0%, transparent 70%)", pointerEvents: "none", animation: "pulse 6s ease-in-out infinite" }} />
        <div style={{ position: "fixed", bottom: "-20%", left: "-10%", width: 600, height: 600, borderRadius: "50%", background: "radial-gradient(circle, rgba(139,45,66,0.06) 0%, transparent 70%)", pointerEvents: "none", animation: "pulse 8s ease-in-out infinite 2s" }} />
        <div style={{ position: "fixed", top: "40%", left: "15%", width: 200, height: 200, borderRadius: "50%", background: "radial-gradient(circle, rgba(232,115,138,0.04) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div style={{ position: "fixed", inset: 0, backgroundImage: "linear-gradient(rgba(232,115,138,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(232,115,138,0.03) 1px, transparent 1px)", backgroundSize: "60px 60px", pointerEvents: "none" }} />

        <div style={{ width: "100%", maxWidth: 420, animation: "fadeUp 0.5s ease" }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <div style={{ width: 64, height: 64, borderRadius: 18, background: "linear-gradient(135deg, #e8738a, #c94f68)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, margin: "0 auto 16px", boxShadow: "0 0 40px rgba(232,115,138,0.35), 0 0 80px rgba(232,115,138,0.15)", animation: "float 4s ease-in-out infinite" }}>✿</div>
            <h1 style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 36, color: "#f0e6e9", fontWeight: 400, marginBottom: 6, letterSpacing: -0.5 }}>Azalea</h1>
            <p style={{ fontSize: 11, color: "#7a6880", letterSpacing: 3, textTransform: "uppercase", fontFamily: "'DM Mono', monospace" }}>Enterprise Resource Planning</p>
          </div>

          <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(232,115,138,0.15)", borderRadius: 20, padding: "36px 32px", boxShadow: "0 32px 64px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)", backdropFilter: "blur(12px)" }}>
            {error && (
              <div style={{ background: "rgba(235,87,87,0.1)", border: "1px solid rgba(235,87,87,0.25)", borderRadius: 10, padding: "12px 16px", marginBottom: 20, color: "#eb5757", fontSize: 13, fontFamily: "'DM Mono', monospace", display: "flex", alignItems: "center", gap: 8 }}>
                <span>✕</span> {error}
              </div>
            )}

            <div style={{ marginBottom: 18 }}>
              <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: "#7a6880", letterSpacing: 2, textTransform: "uppercase", marginBottom: 8, fontFamily: "'DM Mono', monospace" }}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} placeholder="email@azalea.com" style={{ width: "100%", padding: "12px 16px", background: "rgba(255,255,255,0.04)", border: "1.5px solid rgba(232,115,138,0.15)", borderRadius: 10, fontSize: 14, fontFamily: "'DM Sans', sans-serif", transition: "all 0.2s", boxSizing: "border-box" }} />
            </div>

            <div style={{ marginBottom: 28 }}>
              <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: "#7a6880", letterSpacing: 2, textTransform: "uppercase", marginBottom: 8, fontFamily: "'DM Mono', monospace" }}>Password</label>
              <div style={{ position: "relative" }}>
                <input type={showPass ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} placeholder="••••••••" style={{ width: "100%", padding: "12px 44px 12px 16px", background: "rgba(255,255,255,0.04)", border: "1.5px solid rgba(232,115,138,0.15)", borderRadius: 10, fontSize: 14, fontFamily: "'DM Sans', sans-serif", transition: "all 0.2s", boxSizing: "border-box" }} />
                <button onClick={() => setShowPass(!showPass)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#7a6880", cursor: "pointer", fontSize: 14, padding: 4 }}>
                  {showPass ? "🙈" : "👁"}
                </button>
              </div>
            </div>

            <button onClick={handleLogin} disabled={loading} style={{ width: "100%", padding: "13px", background: loading ? "rgba(232,115,138,0.3)" : "linear-gradient(135deg, #c94f68, #e8738a)", border: "none", borderRadius: 10, color: "#fff", fontSize: 14, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", fontFamily: "'DM Mono', monospace", letterSpacing: 0.5, boxShadow: loading ? "none" : "0 8px 24px rgba(232,115,138,0.35)", transition: "all 0.2s" }}>
              {loading ? "Masuk..." : "Masuk ke Azalea →"}
            </button>
          </div>

          <p style={{ textAlign: "center", marginTop: 24, fontSize: 11, color: "rgba(255,255,255,0.15)", fontFamily: "'DM Mono', monospace", letterSpacing: 1 }}>
            AZALEA ERP · SIOMAY MINI
          </p>
        </div>
      </div>
    </>
  );
}
