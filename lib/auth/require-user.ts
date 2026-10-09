import "server-only";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getClerkDevelopmentConfig } from "./config";

export async function requireClerkUser() {
  if (!getClerkDevelopmentConfig().enabled) redirect("/?auth=sign-in");
  return auth.protect({ unauthenticatedUrl: "/?auth=sign-in" });
}
