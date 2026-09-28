/**
 * Minimal Delhivery (Indian logistics) shipment client.
 * fetch-only, edge-runtime-safe. Keys are read at call time; missing keys
 * raise a clear, catchable error — same "unavailable until configured"
 * pattern as stripe.server.ts. Mirrors dhl.server.ts's shape so the admin
 * orders flow can call either carrier interchangeably.
 */
import type { ShipmentAddress, ShipmentResult, TrackingStatus } from "./dhl.server";

export class DelhiveryNotConfiguredError extends Error {
  constructor(key: string) {
    super(`${key} is not configured. Add the secret to enable Delhivery shipments.`);
    this.name = "DelhiveryNotConfiguredError";
  }
}

const DELHIVERY_API_BASE = process.env["DELHIVERY_API_BASE"] || "https://track.delhivery.com";

function apiToken(): string {
  const key = process.env["DELHIVERY_API_TOKEN"];
  if (!key) throw new DelhiveryNotConfiguredError("DELHIVERY_API_TOKEN");
  return key;
}

function clientName(): string {
  const key = process.env["DELHIVERY_CLIENT_NAME"];
  if (!key) throw new DelhiveryNotConfiguredError("DELHIVERY_CLIENT_NAME");
  return key;
}

async function delhiveryRequest<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${DELHIVERY_API_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Token ${apiToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as T & { error?: string; rmk?: string };
  if (!res.ok) {
    throw new Error(json.error ?? json.rmk ?? `Delhivery request failed (${res.status})`);
  }
  return json;
}

/** Create an outbound shipment (waybill) and return a tracking number. */
export async function createShipment(params: {
  shipTo: ShipmentAddress;
  weightKg: number;
  orderNumber: string;
  declaredValue: number;
}): Promise<ShipmentResult> {
  const json = await delhiveryRequest<{
    packages?: Array<{ waybill: string; status: string; serviceable: boolean }>;
  }>("/api/cmu/create.json", {
    shipments: [
      {
        name: `${params.shipTo.first_name} ${params.shipTo.last_name}`,
        add: [params.shipTo.line1, params.shipTo.line2].filter(Boolean).join(", "),
        pin: params.shipTo.postal_code,
        city: params.shipTo.city,
        state: params.shipTo.state ?? "",
        country: params.shipTo.country,
        phone: params.shipTo.phone ?? "",
        order: params.orderNumber,
        payment_mode: "Prepaid",
        weight: params.weightKg * 1000,
        cod_amount: 0,
        total_amount: params.declaredValue,
      },
    ],
    pickup_location: { name: clientName() },
  });

  const pkg = json.packages?.[0];
  if (!pkg?.waybill) throw new Error("Delhivery did not return a waybill number");

  return {
    trackingNumber: pkg.waybill,
    labelUrl: `${DELHIVERY_API_BASE}/api/p/packing_slip?wbns=${encodeURIComponent(pkg.waybill)}&pdf=true`,
    carrierShipmentId: pkg.waybill,
  };
}

/** Look up the current status of a waybill/tracking number. */
export async function trackShipment(trackingNumber: string): Promise<TrackingStatus> {
  const res = await fetch(
    `${DELHIVERY_API_BASE}/api/v1/packages/json/?waybill=${encodeURIComponent(trackingNumber)}&token=${apiToken()}`,
  );
  if (!res.ok) throw new Error(`Delhivery tracking lookup failed (${res.status})`);
  const json = (await res.json()) as {
    ShipmentData?: Array<{ Shipment?: { Status?: { Status?: string; StatusDateTime?: string } } }>;
  };
  const status = json.ShipmentData?.[0]?.Shipment?.Status;
  const raw = (status?.Status ?? "").toLowerCase();
  return {
    status: raw.includes("delivered")
      ? "delivered"
      : raw.includes("rto") || raw.includes("undelivered") || raw.includes("exception")
        ? "exception"
        : raw
          ? "in_transit"
          : "unknown",
    description: status?.Status ?? "No status yet",
    deliveredAt: raw.includes("delivered") ? (status?.StatusDateTime ?? null) : null,
  };
}
