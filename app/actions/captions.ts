"use server";
import { unstable_rethrow } from "next/navigation";
import { setOwnedCaptionPreference, setOwnedCaptionStyle } from "@/lib/captions/server";

export async function setCaptionPreferenceAction(input: unknown) {
  try { return { ok: await setOwnedCaptionPreference(input) }; }
  catch (error) { unstable_rethrow(error); return { ok: false }; }
}

export async function setCaptionStyleAction(input: unknown) {
  try { return { ok: await setOwnedCaptionStyle(input) }; }
  catch (error) { unstable_rethrow(error); return { ok: false }; }
}
