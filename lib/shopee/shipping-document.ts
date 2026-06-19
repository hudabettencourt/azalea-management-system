// lib/shopee/shipping-document.ts
// Shopee AWB flow (4 langkah):
// 1. get_shipping_document_parameter
// 2. create_shipping_document
// 3. get_shipping_document_result (poll sampai READY)
// 4. download_shipping_document
import { shopeeApi, shopeeApiPost, shopeeApiPostBinary } from "./helper";

export type OrderDocInput = {
  order_sn: string;
  package_number?: string;
  tracking_number?: string;
};

type OrderDocPrepared = OrderDocInput & {
  shipping_document_type: string;
};

const DEFAULT_DOC_TYPE = "THERMAL_AIR_WAYBILL";
const POLL_ATTEMPTS = 15;
const POLL_INTERVAL_MS = 2000;

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function shopeeErr(res: any, fallback: string): string {
  const list = res?.response?.result_list as any[] | undefined;
  const itemErr = list?.find(r => r.fail_message || r.fail_error);
  if (itemErr) return itemErr.fail_message || itemErr.fail_error;
  return res?.message || res?.error || fallback;
}

function toOrderListItem(o: OrderDocInput | OrderDocPrepared) {
  const item: Record<string, string> = { order_sn: o.order_sn };
  if (o.package_number) item.package_number = o.package_number;
  if ("shipping_document_type" in o && o.shipping_document_type) {
    item.shipping_document_type = o.shipping_document_type;
  }
  if (o.tracking_number) item.tracking_number = o.tracking_number;
  return item;
}

export async function resolveOrderPackages(
  shopId: number,
  accessToken: string,
  orderSnList: string[],
): Promise<OrderDocInput[]> {
  const bySn = new Map<string, OrderDocInput>();
  for (const sn of orderSnList) bySn.set(sn, { order_sn: sn });

  for (const batch of chunk(orderSnList, 50)) {
    const detailRes = await shopeeApi("/api/v2/order/get_order_detail", shopId, accessToken, {
      order_sn_list: batch.join(","),
      response_optional_fields: "package_list",
    });
    for (const order of detailRes.response?.order_list || []) {
      const pkg = order.package_list?.[0];
      bySn.set(order.order_sn, {
        order_sn: order.order_sn,
        package_number: pkg?.package_number,
        tracking_number: pkg?.tracking_number,
      });
    }
  }

  for (const order of bySn.values()) {
    if (order.tracking_number) continue;
    const params: Record<string, string> = { order_sn: order.order_sn };
    if (order.package_number) params.package_number = order.package_number;
    const tnRes = await shopeeApi("/api/v2/logistics/get_tracking_number", shopId, accessToken, params);
    if (!tnRes.error && tnRes.response) {
      order.tracking_number = tnRes.response.tracking_number || order.tracking_number;
      order.package_number = order.package_number || tnRes.response.package_number;
    }
  }

  return orderSnList.map(sn => bySn.get(sn) || { order_sn: sn });
}

async function getDocumentParameters(
  shopId: number,
  accessToken: string,
  orders: OrderDocInput[],
): Promise<OrderDocPrepared[]> {
  const paramRes = await shopeeApiPost(
    "/api/v2/logistics/get_shipping_document_parameter",
    shopId,
    accessToken,
    { order_list: orders.map(toOrderListItem) },
  );
  if (paramRes.error) throw new Error(shopeeErr(paramRes, "get_shipping_document_parameter gagal"));

  const paramMap = new Map<string, { type: string; err?: string }>();
  for (const row of paramRes.response?.result_list || []) {
    if (row.fail_error || row.fail_message) {
      paramMap.set(row.order_sn, { type: DEFAULT_DOC_TYPE, err: row.fail_message || row.fail_error });
      continue;
    }
    const docType =
      row.suggest_shipping_document_type ||
      row.selectable_shipping_document_type?.[0] ||
      DEFAULT_DOC_TYPE;
    paramMap.set(row.order_sn, { type: docType });
  }

  const prepared: OrderDocPrepared[] = [];
  for (const order of orders) {
    const p = paramMap.get(order.order_sn);
    if (p?.err) throw new Error(`${order.order_sn}: ${p.err}`);
    prepared.push({
      ...order,
      shipping_document_type: p?.type || DEFAULT_DOC_TYPE,
    });
  }
  return prepared;
}

async function createDocuments(
  shopId: number,
  accessToken: string,
  orders: OrderDocPrepared[],
) {
  const createRes = await shopeeApiPost(
    "/api/v2/logistics/create_shipping_document",
    shopId,
    accessToken,
    { order_list: orders.map(toOrderListItem) },
  );
  const resultList = createRes.response?.result_list || [];
  const hardFailed = resultList.filter(
    (r: any) => r.fail_error && r.fail_error !== "logistics.shipping_document_already_created",
  );
  if (hardFailed.length) {
    throw new Error(hardFailed.map((r: any) => `${r.order_sn}: ${r.fail_message || r.fail_error}`).join("; "));
  }
  if (createRes.error && !resultList.some((r: any) => !r.fail_error || r.order_sn)) {
    throw new Error(shopeeErr(createRes, "create_shipping_document gagal"));
  }
  return createRes;
}

async function waitUntilReady(
  shopId: number,
  accessToken: string,
  orders: OrderDocPrepared[],
) {
  const queryList = orders.map(o => toOrderListItem(o));
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
    const resultRes = await shopeeApiPost(
      "/api/v2/logistics/get_shipping_document_result",
      shopId,
      accessToken,
      { order_list: queryList },
    );
    if (resultRes.error) throw new Error(shopeeErr(resultRes, "get_shipping_document_result gagal"));

    const rows = resultRes.response?.result_list || [];
    const failed = rows.filter((r: any) => r.fail_error || r.status === "FAILED");
    if (failed.length) {
      throw new Error(failed.map((r: any) => `${r.order_sn}: ${r.fail_message || r.fail_error}`).join("; "));
    }
    const allReady = rows.length > 0 && rows.every((r: any) => r.status === "READY");
    if (allReady) return resultRes;
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error("Timeout: dokumen pengiriman belum READY. Coba lagi dalam beberapa detik.");
}

async function downloadDocument(
  shopId: number,
  accessToken: string,
  orders: OrderDocPrepared[],
  shippingDocumentType: string,
) {
  const downloadRes = await shopeeApiPostBinary(
    "/api/v2/logistics/download_shipping_document",
    shopId,
    accessToken,
    {
      shipping_document_type: shippingDocumentType,
      order_list: orders.map(o => toOrderListItem(o)),
    },
  );
  if (!downloadRes.ok) throw new Error(shopeeErr(downloadRes.json, "download_shipping_document gagal"));
  return downloadRes.data;
}

export type ShippingDocumentResult = {
  pdf: Buffer;
  shipping_document_type: string;
  steps: {
    packages: OrderDocInput[];
    parameter: any;
    create: any;
    result: any;
  };
};

export async function fetchShippingDocumentPdf(
  shopId: number,
  accessToken: string,
  orderSnList: string[],
  preferredDocType?: string,
): Promise<ShippingDocumentResult> {
  const packages = await resolveOrderPackages(shopId, accessToken, orderSnList);
  const prepared = await getDocumentParameters(shopId, accessToken, packages);
  const docType = preferredDocType || prepared[0]?.shipping_document_type || DEFAULT_DOC_TYPE;
  const withType = prepared.map(o => ({ ...o, shipping_document_type: docType }));

  const create = await createDocuments(shopId, accessToken, withType);
  const result = await waitUntilReady(shopId, accessToken, withType);
  const pdfBuffer = await downloadDocument(shopId, accessToken, withType, docType);

  return {
    pdf: pdfBuffer,
    shipping_document_type: docType,
    steps: { packages, parameter: prepared, create, result },
  };
}
