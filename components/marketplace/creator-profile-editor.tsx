"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AccountAction } from "@/components/account-action";
import { saveCreatorProfileAction, removeCreatorAvatarAction } from "@/app/actions/creator-profile";
import { avatarMaximumBytes, avatarMimeTypes, type CreatorProfile } from "@/lib/marketplace/creators/contract";
import { CreatorAvatar } from "./creator-avatar";

export function CreatorProfileEditor(props: { clerkUserId: string; profile: CreatorProfile | null }) {
  const { isLoaded, userId } = useAuth();
  if (!isLoaded) return <p role="status">Opening your public profile settings…</p>;
  if (userId !== props.clerkUserId) return <AccountAction intent="sign-in">Sign in to manage your public profile</AccountAction>;
  return <Editor key={userId} initial={props.profile} />;
}
function Editor({ initial }: { initial: CreatorProfile | null }) {
  const id = useId(), busy = useRef(false);
  const [profile, setProfile] = useState(initial), [displayName, setName] = useState(initial?.displayName ?? ""), [bio, setBio] = useState(initial?.bio ?? ""), [slug, setSlug] = useState(initial?.slug ?? "");
  const [pending, setPending] = useState(false), [message, setMessage] = useState(""), [failed, setFailed] = useState(false), [file, setFile] = useState<File | null>(null), [revision, setRevision] = useState(0);
  async function perform(operation: () => Promise<{ ok: boolean; profile?: CreatorProfile; message?: string }>, success: string) {
    if (busy.current) return;
    busy.current = true; setPending(true); setFailed(false); setMessage("");
    try {
      const result = await operation();
      if (!result.ok || !result.profile) { setFailed(true); setMessage(result.message ?? "Your profile couldn’t be saved. Please try again."); return; }
      setProfile(result.profile); setSlug(result.profile.slug); setRevision(v => v + 1); setMessage(success);
    } catch { setFailed(true); setMessage("Your profile couldn’t be saved. Check your connection and try again."); }
    finally { busy.current = false; setPending(false); }
  }
  function save(event: FormEvent) {
    event.preventDefault();
    void perform(() => saveCreatorProfileAction({ displayName, bio, slug: profile ? null : slug || null }), "Public profile saved.");
  }
  async function upload() {
    if (!file) return;
    if (file.size > avatarMaximumBytes || !(avatarMimeTypes as readonly string[]).includes(file.type)) { setFailed(true); setMessage("Choose a JPEG, PNG or WebP image up to 2 MiB."); return; }
    await perform(async () => {
      const response = await fetch("/api/marketplace/creator-avatar", { method: "POST", headers: { "Content-Type": file.type }, body: file });
      return response.json();
    }, "Public avatar saved.");
  }
  return <div className="max-w-3xl space-y-6">
    <form onSubmit={save} className="sceenyk-card space-y-5 p-5 sm:p-7" aria-busy={pending}>
      <h2 className="text-xl font-semibold">Public Marketplace profile</h2>
      <p className="text-body-sm text-muted-foreground">Your name, bio and avatar appear publicly in Marketplace. Your account settings, projects, earnings and payout details stay private.</p>
      <fieldset disabled={pending} className="space-y-5">
        <div><label htmlFor={`${id}-name`} className="text-body-sm font-medium">Public display name</label><input id={`${id}-name`} name="displayName" required maxLength={80} className="sceenyk-field mt-2" value={displayName} onChange={e => setName(e.target.value)} /></div>
        <div><label htmlFor={`${id}-bio`} className="text-body-sm font-medium">Public bio</label><textarea id={`${id}-bio`} name="bio" rows={4} maxLength={500} className="sceenyk-field mt-2 resize-y" value={bio} onChange={e => setBio(e.target.value)} /><p className="mt-2 text-caption text-muted-foreground">Up to 500 characters. Leave out email, private IDs and access details.</p></div>
        <div><label htmlFor={`${id}-slug`} className="text-body-sm font-medium">Creator slug</label><input id={`${id}-slug`} name="slug" maxLength={64} readOnly={!!profile} className="sceenyk-field mt-2" value={slug} onChange={e => setSlug(e.target.value)} aria-describedby={`${id}-slug-help`} /><p id={`${id}-slug-help`} className="mt-2 break-words text-caption text-muted-foreground">{profile ? `Your public URL stays /marketplace/creators/${profile.slug}, even when your name changes.` : "Optional initial choice; otherwise we use your public name. Conflicts receive a neutral suffix. Your assigned slug stays fixed after setup."}</p></div>
        <Button type="submit">{pending ? "Saving…" : "Save public profile"}</Button>
      </fieldset>
    </form>
    <section className="sceenyk-card space-y-4 p-5 sm:p-7" aria-labelledby={`${id}-avatar-title`}>
      <h2 id={`${id}-avatar-title`} className="text-xl font-semibold">Public avatar</h2>
      <CreatorAvatar name={profile?.displayName ?? displayName} url={profile?.avatarUrl ? `${profile.avatarUrl}?v=${revision}` : null} large />
      <p className="text-body-sm text-muted-foreground">Upload an image you want to make public. JPEG, PNG or WebP up to 2 MiB. We publish a small image with its original metadata removed.</p>
      <fieldset disabled={!profile || pending} className="space-y-4">
        <div><label htmlFor={`${id}-avatar`} className="text-body-sm font-medium">Choose avatar image</label><input id={`${id}-avatar`} name="avatar" type="file" accept="image/jpeg,image/png,image/webp" className="sceenyk-field mt-2 max-w-full" onChange={e => setFile(e.target.files?.[0] ?? null)} /></div>
        <div className="flex flex-wrap gap-3"><Button type="button" variant="outline" disabled={!file} onClick={() => void upload()}>Save public avatar</Button>{profile?.avatarUrl && <Button type="button" variant="ghost" onClick={() => void perform(removeCreatorAvatarAction, "Public avatar removed.")}>Remove avatar</Button>}</div>
      </fieldset>
      {!profile && <p className="text-caption text-muted-foreground">Save your public profile first.</p>}
    </section>
    <p role="status" aria-live="polite" className={`min-h-6 text-body-sm ${failed ? "text-destructive" : "text-success-foreground"}`}>{message}</p>
    {profile && <Link className="nav-link inline-flex min-h-11 items-center break-words text-link" href={`/marketplace/creators/${profile.slug}`}>View your public storefront</Link>}
  </div>;
}
