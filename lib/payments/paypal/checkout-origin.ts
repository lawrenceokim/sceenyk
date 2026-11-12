import "server-only";
import { headers } from "next/headers";
import { checkoutOrigin } from "@/lib/application-origin";

export async function requestCheckoutOrigin() {
  const request = await headers();
  return checkoutOrigin(request.get("origin"), request.get("x-forwarded-host") ?? request.get("host"));
}
