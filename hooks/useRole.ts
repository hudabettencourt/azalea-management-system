"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type UserRole = "owner" | "super_admin" | "keuangan" | "produksi" | "purchasing" | "kasir" | "admin_penjualan" | null;

export type UserProfile = {
  id: string;
  email: string;
  nama: string;
  role: UserRole;
};

export function useRole() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { setLoading(false); return; }
        const { data } = await supabase
          .from("profiles")
          .select("id, email, nama, role")
          .eq("id", session.user.id)
          .single();
        setProfile(data || null);
      } catch {
        setProfile(null);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);

  const isOwner = profile?.role === "owner" || profile?.role === "super_admin";
  const isKeuangan = profile?.role === "keuangan" || isOwner;
  const isPurchasing = profile?.role === "purchasing" || isOwner;
  const isProduksi = profile?.role === "produksi" || isOwner;
  const isKasir = profile?.role === "kasir" || profile?.role === "admin_penjualan" || isOwner;

  return { profile, loading, isOwner, isKeuangan, isPurchasing, isProduksi, isKasir };
}