export type MarketplacePurchaseRow = {
  id: string; listing_id: string; buyer_user_id: string; creator_user_id: string;
  environment: "sandbox"; listing_title: string; template_snapshot: unknown;
  amount_minor: number; platform_fee_minor: number; creator_net_minor: number; fee_bps: number; pricing_version: string; currency: "USD";
  paypal_order_id: string | null; paypal_capture_id: string | null; capture_request_id: string;
  paypal_create_started_at: string | null;
  status: "pending" | "approved" | "completed" | "failed";
  created_at: string; updated_at: string; completed_at: string | null; failed_at: string | null;
};
