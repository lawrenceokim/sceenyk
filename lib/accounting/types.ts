export type FreeAllowance = {
  total: number;
  available: number;
  reserved: number;
  consumed: number;
  reviewRequired?: boolean;
};
