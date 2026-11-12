"use client";

import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { AccountSettingsClient, CreationSettingsClient, ProfileSettingsClient, ManagedTemplatesClient } from "@/components/cache/account-pages";
import { PrivacySettingsSection, CreationPreferencesSection, CreatorProfileSection } from "./settings-content-shells";
import { SettingsSection } from "./settings-section";
import { GallerySkeleton, ProjectPickerSkeleton } from "@/components/marketplace/gallery-skeletons";
import { ListingEditorSkeleton } from "@/components/marketplace/detail-skeletons";

export function SettingsLoading() {
  const pathname = usePathname();
  if (pathname === "/settings/templates/new") return <SettingsSection title="New Template" description="Start with one of your Projects."><ProjectPickerSkeleton /></SettingsSection>;
  if (pathname.startsWith("/settings/templates/")) return <ListingEditorSkeleton />;
  if (pathname === "/settings/templates") return <SettingsSection title="Manage Templates" description="Manage your drafts, published templates and unpublished listings."><Suspense fallback={<GallerySkeleton variant="management" />}><ManagedTemplatesClient cachedOnly /></Suspense></SettingsSection>;
  if (pathname === "/settings/creation") return <CreationPreferencesSection><CreationSettingsClient cachedOnly /></CreationPreferencesSection>;
  if (pathname === "/settings/creator-profile") return <CreatorProfileSection><ProfileSettingsClient cachedOnly /></CreatorProfileSection>;
  if (pathname === "/settings/privacy") return <PrivacySettingsSection><AccountSettingsClient security cachedOnly /></PrivacySettingsSection>;
  if (["/settings/appearance", "/settings/notifications", "/settings/data"].includes(pathname)) return null;
  return <SettingsSection title="Account" description="Your private identity and sign-in account."><AccountSettingsClient cachedOnly /></SettingsSection>;
}
