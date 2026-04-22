"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async () => {
    if (!email || !password) {
      setError("Email dan password harus diisi!");
      return;
    }
    setLoading(true);
    setError("");

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError("Email atau password salah. Coba lagi.");
      setLoading(false);
      return;
    }

    // Redirect ke halaman utama setelah login berhasil
    window.location.href = "/";
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;600;700;800&family=Instrument+Serif:ital@0;1&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input:focus { outline: none; border-color: #10b981 !important; box-shadow: 0 0 0 3px rgba(16,185,129,0.15); }
      `}</style>

      <div style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f4c35 100%)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "'Instrument Sans', sans-serif", padding: "20px",
      }}>
        {/* Decorative circles */}
        <div style={{ position: "fixed", top: "-100px", right: "-100px", width: "400px", height: "400px", borderRadius: "50%", background: "rgba(16,185,129,0.08)", pointerEvents: "none" }} />
        <div style={{ position: "fixed", bottom: "-150px", left: "-100px", width: "500px", height: "500px", borderRadius: "50%", background: "rgba(16,185,129,0.05)", pointerEvents: "none" }} />

        <div style={{
          background: "rgba(255,255,255,0.05)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: "24px",
          padding: "48px 40px",
          width: "100%", maxWidth: "420px",
          boxShadow: "0 32px 64px rgba(0,0,0,0.4)",
          position: "relative", zIndex: 1,
        }}>
          {/* Logo */}
          <div style={{ textAlign: "center", marginBottom: "40px" }}>
            <div style={{ fontSize: "48px", marginBottom: "12px" }}>🌸</div>
            <h1 style={{
              fontFamily: "'Instrument Serif', serif",
              fontSize: "32px", color: "#fff",
              fontWeight: 400, marginBottom: "6px",
            }}>Azalea</h1>
            <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.45)", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}>
              Enterprise Resource Planning
            </p>
          </div>

          {/* Error message */}
          {error && (
            <div style={{
              background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: "10px", padding: "12px 16px", marginBottom: "20px",
              color: "#fca5a5", fontSize: "13px", textAlign: "center",
            }}>
              {error}
            </div>
          )}

          {/* Form */}
          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "rgba(255,255,255,0.5)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "8px" }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              placeholder="email@azalea.com"
              style={{
                width: "100%", padding: "13px 16px",
                background: "rgba(255,255,255,0.07)",
                border: "1.5px solid rgba(255,255,255,0.1)",
                borderRadius: "10px", color: "#fff",
                fontSize: "15px", fontFamily: "'Instrument Sans', sans-serif",
                transition: "border-color 0.2s",
              }}
            />
          </div>

          <div style={{ marginBottom: "28px" }}>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "rgba(255,255,255,0.5)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "8px" }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              placeholder="••••••••"
              style={{
                width: "100%", padding: "13px 16px",
                background: "rgba(255,255,255,0.07)",
                border: "1.5px solid rgba(255,255,255,0.1)",
                borderRadius: "10px", color: "#fff",
                fontSize: "15px", fontFamily: "'Instrument Sans', sans-serif",
                transition: "border-color 0.2s",
              }}
            />
          </div>

          <button
            onClick={handleLogin}
            disabled={loading}
            style={{
              width: "100%", padding: "14px",
              background: loading ? "rgba(16,185,129,0.5)" : "linear-gradient(135deg, #10b981, #059669)",
              border: "none", borderRadius: "10px",
              color: "#fff", fontSize: "15px", fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
              fontFamily: "'Instrument Sans', sans-serif",
              boxShadow: loading ? "none" : "0 8px 24px rgba(16,185,129,0.35)",
              transition: "all 0.2s",
              letterSpacing: "0.02em",
            }}
          >
            {loading ? "Masuk..." : "Masuk ke Azalea"}
          </button>

          <p style={{ textAlign: "center", marginTop: "24px", fontSize: "12px", color: "rgba(255,255,255,0.25)" }}>
            Azalea ERP · Siomay Mini
          </p>
        </div>
      </div>
    </>
  );
}
