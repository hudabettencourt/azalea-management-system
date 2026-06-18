import { redirect } from "next/navigation";

export default function LaporanPelangganPage() {
  redirect("/laporan?tab=pelanggan");
}
