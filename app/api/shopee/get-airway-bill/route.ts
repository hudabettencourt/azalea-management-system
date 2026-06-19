// app/api/shopee/get-airway-bill/route.ts
// POST /api/shopee/get-airway-bill
// Body: { toko_id, order_sn_list: string[], shipping_document_type? }
// Header X-Response-Format: pdf → kembalikan PDF inline (untuk preview cetak langsung)
// Default JSON → { success, pdf_base64, ... } (legacy)
import { NextRequest, NextResponse } from "next/server";
import { fetchToko, getValidToken, logShopeeResponse } from "@/lib/shopee/_token";
import { fetchShippingDocumentPdf } from "@/lib/shopee/shipping-document";

type Body = {
  toko_id: number;
  order_sn_list: string[];
  shipping_document_type?: string;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;
    if (!body.toko_id || !body.order_sn_list?.length) {
      return NextResponse.json({ error: "toko_id dan order_sn_list wajib" }, { status: 400 });
    }

    const [toko] = await fetchToko(body.toko_id);
    const accessToken = await getValidToken(toko);

    const result = await fetchShippingDocumentPdf(
      toko.shopee_shop_id,
      accessToken,
      body.order_sn_list,
      body.shipping_document_type,
    );

    logShopeeResponse("download_shipping_document", toko.nama, {
      orders: body.order_sn_list,
      shipping_document_type: result.shipping_document_type,
      pdf_bytes: result.pdf.length,
    });

    const wantPdf = req.headers.get("x-response-format") === "pdf";
    if (wantPdf) {
      return new NextResponse(new Uint8Array(result.pdf), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": "inline",
          "X-Shipping-Document-Type": result.shipping_document_type,
        },
      });
    }

    return NextResponse.json({
      success: true,
      toko: toko.nama,
      pdf_base64: result.pdf.toString("base64"),
      shipping_document_type: result.shipping_document_type,
      raw: result,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
