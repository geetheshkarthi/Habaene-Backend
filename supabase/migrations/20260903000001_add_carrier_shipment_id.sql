-- Stores the carrier's own shipment/waybill id (distinct from the
-- customer-facing tracking_number) for DHL/Delhivery API-created shipments.
-- Manual admin-entered tracking (no carrier API call) leaves this null.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS carrier_shipment_id text;
