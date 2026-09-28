/**
 * Minimal DHL Express (MyDHL API) shipment client.
 * fetch-only, edge-runtime-safe. Keys are read at call time; missing keys
 * raise a clear, catchable error — same "unavailable until configured"
 * pattern as stripe.server.ts. Uses the MyDHL API (api-eu.dhl.com), the
 * current DHL Express integration for a business account; adjust
 * `DHL_API_BASE` if your account uses a different region/product.
 */

export class DhlNotConfiguredError extends Error {
  constructor(key: string) {
    super(`${key} is not configured. Add the secret to enable DHL shipments.`);
    this.name = "DhlNotConfiguredError";
  }
}

const DHL_API_BASE = process.env["DHL_API_BASE"] || "https://api-eu.dhl.com/mydhlapi";

function apiKey(): string {
  const key = process.env["DHL_API_KEY"];
  if (!key) throw new DhlNotConfiguredError("DHL_API_KEY");
  return key;
}

function apiSecret(): string {
  const key = process.env["DHL_API_SECRET"];
  if (!key) throw new DhlNotConfiguredError("DHL_API_SECRET");
  return key;
}

function accountNumber(): string {
  const key = process.env["DHL_ACCOUNT_NUMBER"];
  if (!key) throw new DhlNotConfiguredError("DHL_ACCOUNT_NUMBER");
  return key;
}

async function dhlRequest<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const auth = btoa(`${apiKey()}:${apiSecret()}`);
  const res = await fetch(`${DHL_API_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as T & { detail?: string; title?: string };
  if (!res.ok) {
    throw new Error(json.detail ?? json.title ?? `DHL request failed (${res.status})`);
  }
  return json;
}

export interface ShipmentAddress {
  first_name: string;
  last_name: string;
  line1: string;
  line2?: string;
  postal_code: string;
  city: string;
  state?: string;
  country: string;
  phone?: string;
}

export interface ShipmentResult {
  trackingNumber: string;
  labelUrl: string | null;
  carrierShipmentId: string;
}

/** Create an outbound shipment and return a tracking number + label. */
export async function createShipment(params: {
  shipTo: ShipmentAddress;
  weightKg: number;
  orderNumber: string;
  currency: string;
  declaredValue: number;
}): Promise<ShipmentResult> {
  const json = await dhlRequest<{
    shipmentTrackingNumber: string;
    documents?: Array<{ content: string; typeCode: string }>;
  }>("/shipments", {
    plannedShippingDateAndTime: new Date().toISOString(),
    productCode: "P",
    accounts: [{ typeCode: "shipper", number: accountNumber() }],
    customerReferences: [{ value: params.orderNumber }],
    content: {
      packages: [{ weight: params.weightKg, dimensions: undefined }],
      isCustomsDeclarable: params.shipTo.country !== "DE",
      declaredValue: params.declaredValue,
      declaredValueCurrency: params.currency,
      description: `HABÄNE order ${params.orderNumber}`,
      unitOfMeasurement: "metric",
    },
    receiver: {
      postalAddress: {
        addressLine1: params.shipTo.line1,
        addressLine2: params.shipTo.line2,
        postalCode: params.shipTo.postal_code,
        cityName: params.shipTo.city,
        countryCode: params.shipTo.country,
      },
      contactInformation: {
        fullName: `${params.shipTo.first_name} ${params.shipTo.last_name}`,
        phone: params.shipTo.phone,
      },
    },
    outputImageProperties: { printerDPI: 300, encodingFormat: "pdf" },
  });

  const label = json.documents?.find((d) => d.typeCode === "label");
  return {
    trackingNumber: json.shipmentTrackingNumber,
    labelUrl: label ? `data:application/pdf;base64,${label.content}` : null,
    carrierShipmentId: json.shipmentTrackingNumber,
  };
}

export interface TrackingStatus {
  status: "in_transit" | "delivered" | "exception" | "unknown";
  description: string;
  deliveredAt: string | null;
}

/** Look up the current status of a tracking number. */
export async function trackShipment(trackingNumber: string): Promise<TrackingStatus> {
  const auth = btoa(`${apiKey()}:${apiSecret()}`);
  const res = await fetch(
    `${DHL_API_BASE}/shipments/${encodeURIComponent(trackingNumber)}/tracking`,
    { headers: { Authorization: `Basic ${auth}` } },
  );
  if (!res.ok) throw new Error(`DHL tracking lookup failed (${res.status})`);
  const json = (await res.json()) as {
    shipments?: Array<{ status?: { statusCode?: string; description?: string; timestamp?: string } }>;
  };
  const status = json.shipments?.[0]?.status;
  const code = status?.statusCode?.toLowerCase() ?? "";
  return {
    status: code.includes("delivered")
      ? "delivered"
      : code.includes("exception") || code.includes("failure")
        ? "exception"
        : code
          ? "in_transit"
          : "unknown",
    description: status?.description ?? "No status yet",
    deliveredAt: code.includes("delivered") ? (status?.timestamp ?? null) : null,
  };
}
