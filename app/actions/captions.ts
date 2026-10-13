"use server";
import { unstable_rethrow } from "next/navigation";
import { setOwnedCaptionPreference } from "@/lib/captions/server";

export async function setCaptionPreferenceAction(input: unknown) {
  try { return { ok: await setOwnedCaptionPreference(input) }; }
  catch (error) { unstable_rethrow(error); return { ok: false }; }
}
