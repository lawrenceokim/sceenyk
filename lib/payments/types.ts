export type PurchaseStatus = "pending" | "approved" | "completed" | "failed" | "cancelled";

export type CreditPack = {
  id: string;
  name: string;
  amount: string;
  currency: "USD";
  credits: number;
};

export type PurchaseRow = {
  id: string;
  owner_user_id: string;
  environment: "sandbox";
  pack_id: string;
  pack_name: string;
  amount_minor: number;
  currency: "USD";
  credits: number;
  paypal_order_id: string | null;
  paypal_capture_id: string | null;
  capture_request_id: string;
  status: PurchaseStatus;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type PurchaseSummary = Pick<PurchaseRow,
  "pack_id" | "pack_name" | "credits" | "status" | "created_at"
> & { orderId: string | null; amount: string; currency: "USD" };

export type CreditWallet = {
  available: number;
  reserved: number;
  lowBalance: boolean;
  activity: {
    type: "reservation" | "consumption" | "release" | "purchase";
    amount: number;
    availableDelta: number;
    createdAt: string;
  }[];
  purchases: PurchaseSummary[];
};

export type PaymentResult<T> = { ok: true; data: T } | { ok: false; message: string };
