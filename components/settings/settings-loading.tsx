"use client";

import { usePathname } from "next/navigation";
import { PrivacySettingsSection, CreationPreferencesSection, CreatorProfileSection } from "./settings-content-shells";
import { SettingsSection } from "./settings-section";
import { AccountSettingsSkeleton, CreationPreferencesSkeleton, CreatorProfileSkeleton } from "./settings-skeletons";
import { GallerySkeleton, ProjectPickerSkeleton } from "@/components/marketplace/gallery-skeletons";
import { ListingEditorSkeleton } from "@/components/marketplace/detail-skeletons";

export function SettingsLoading() {
  const pathname = usePathname();
  if (pathname === "/settings/templates/new") return <SettingsSection title="New Template" description="Start with one of your Projects."><ProjectPickerSkeleton /></SettingsSection>;
  if (pathname.startsWith("/settings/templates/")) return <SettingsSection title="Manage Template" description="Review your template and control when it appears in Marketplace."><ListingEditorSkeleton /></SettingsSection>;
  if (pathname === "/settings/templates") return <SettingsSection title="Manage Templates" description="Manage your drafts, published templates and unpublished listings."><GallerySkeleton variant="management" /></SettingsSection>;
  if (pathname === "/settings/creation") return <CreationPreferencesSection><CreationPreferencesSkeleton /></CreationPreferencesSection>;
  if (pathname === "/settings/creator-profile") return <CreatorProfileSection><CreatorProfileSkeleton /></CreatorProfileSection>;
  if (pathname === "/settings/privacy") return <PrivacySettingsSection><AccountSettingsSkeleton security /></PrivacySettingsSection>;
  if (["/settings/appearance", "/settings/notifications", "/settings/data"].includes(pathname)) return null;
  return <SettingsSection title="Account" description="Your private identity and sign-in account."><AccountSettingsSkeleton /></SettingsSection>;
}
