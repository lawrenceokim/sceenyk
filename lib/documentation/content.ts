// Public product guidance, curated from existing Studio, Marketplace and
// Settings UI. Never import internal context/acceptance documents at runtime.
export type DocumentationSection = {
  id: string;
  title: string;
  paragraphs: readonly string[];
  links?: readonly { label: string; href: string }[];
};
export type DocumentationTopic = {
  slug: string;
  label: string;
  group: string;
  title: string;
  description: string;
  sections: readonly DocumentationSection[];
};

export const documentationTopics: readonly DocumentationTopic[] = [
  {
    slug: "getting-started", label: "Getting started", group: "Getting started", title: "Documentation",
    description: "A guide to your creative workspace: shape an idea, save your work, and make it your own.",
    sections: [
      { id: "what-is-sceenyk", title: "What is Sceenyk?", paragraphs: ["Sceenyk is a creative workspace for describing scenes, bringing your own media and setting the direction for short-form video. Studio is where an idea becomes a saved creative brief.", "Explore Studio and Marketplace without signing in. Saving projects, uploading private media, generating and managing purchases require an account."] },
      { id: "quick-start", title: "Your first creative brief", paragraphs: ["Open Studio, choose a creation type and describe your idea. Adjust the format, duration, visual style and tone, then sign in to save your draft.", "Return to Projects to resume your work. Local file previews are temporary; save the project and explicitly upload media to keep it with the draft."], links: [{ label: "Open Studio", href: "/studio" }, { label: "Your projects", href: "/projects" }] },
      { id: "before-generation", title: "Before you generate", paragraphs: ["Review the cost in your project before confirming a generation. Signing in or saving a draft does not automatically start paid work.", "Final video rendering is currently deferred. Saved plans, visual scenes or narration are intermediate work, not a finished export. Check the status shown in your project for what is actually ready."], links: [{ label: "Studio guide", href: "/documentation/studio" }, { label: "Credits guide", href: "/documentation/credits" }] },
    ],
  },
  {
    slug: "studio", label: "Studio", group: "Your workspace", title: "Studio",
    description: "Set the creative direction, bring your sources and review the request before generating.",
    sections: [
      { id: "creative-direction", title: "Describe the scene", paragraphs: ["Choose a creation type, enter your prompt and adjust the supported creative settings. Your preview reflects the current brief or selected source; it does not claim a finished generated result.", "You can explore these choices as a guest. Signing in from Studio preserves your brief choices in this tab for up to 30 minutes. Local files stay temporary; select them again if authentication reloads the browser."] },
      { id: "sources", title: "Bring your own media", paragraphs: ["Add a supported image, video or audio file to preview it locally. Save an owned project before uploading media. A local preview and a completed upload are different states.", "Reopen an uploaded source from the same saved project. Your private project media is not included when you publish a reusable Marketplace template."] },
      { id: "generation-status", title: "Review cost and follow progress", paragraphs: ["Use the project’s cost-review controls, then explicitly confirm the current quote. Editing the request requires a new quote. Insufficient credits or unavailable pricing must be resolved before confirmation.", "Generation status is saved with your project. Return to the project to check its actual progress or error. Intermediate readiness does not mean the final video is complete; final rendering remains deferred."], links: [{ label: "Open Studio", href: "/studio" }, { label: "Credits & Billing", href: "/settings/credits" }] },
    ],
  },
  {
    slug: "projects-templates", label: "Projects & templates", group: "Your workspace", title: "Projects & templates",
    description: "Keep private drafts separate from the reusable configurations you share.",
    sections: [
      { id: "saved-projects", title: "Save and resume", paragraphs: ["Projects contains your saved private drafts, newest first. Open a draft to resume its brief, uploaded sources and latest generation status. Only the owner can open or change the project."], links: [{ label: "Open Projects", href: "/projects" }] },
      { id: "template-library", title: "Your template gallery", paragraphs: ["Templates displays configurations from your existing Marketplace listings, including draft, published, unpublished and archived listings. Open a template to review it, then choose Update Template to manage it in Settings.", "Covers use each template’s saved muted preview color. They do not show private creator uploads or imply a generated video exists. A separate saved-template collection and template-library filters are not available."], links: [{ label: "Open Templates", href: "/templates" }] },
      { id: "adopted-work", title: "Adopted templates are projects", paragraphs: ["Adopting a Marketplace template creates your own editable project. Find that work in Projects and add your own ideas and media. The creator keeps the original project.", "Your Marketplace purchase history remains separate, with recovery controls for an existing paid purchase. Check that history before starting another checkout if payment status is uncertain."], links: [{ label: "Marketplace purchases", href: "/marketplace/purchases" }, { label: "Marketplace guide", href: "/documentation/marketplace" }] },
    ],
  },
  {
    slug: "marketplace", label: "Marketplace", group: "Discover & share", title: "Marketplace",
    description: "Explore reusable creator templates, adopt a starting point or publish your own approach.",
    sections: [
      { id: "discover", title: "Find a starting point", paragraphs: ["Browse published creator templates, search titles, descriptions or tags, and use the existing category filter. Creator links open public storefronts; template details explain the reusable settings and instructions."], links: [{ label: "Explore Marketplace", href: "/marketplace" }] },
      { id: "adoption", title: "Understand adoption", paragraphs: ["Free adoption costs zero credits. Paid adoption has a separate creator price and currently uses PayPal Sandbox. Adoption includes no future AI generation usage; your project shows the generation cost before you confirm.", "Your copy belongs to you. Creator uploads and generated media are excluded, and adoption never transfers the original private project."] },
      { id: "publishing", title: "Publish from an owned project", paragraphs: ["Choose a saved project you own, review its reusable configuration, write the public listing information and confirm your rights before publishing. Draft and unpublished listings stay out of public discovery.", "Manage your public display name, stable creator slug, avatar and biography in Settings → Creator Profile. Your private account identity and financial records stay separate."], links: [{ label: "Manage listings", href: "/settings/templates" }, { label: "Creator Profile", href: "/settings/creator-profile" }] },
    ],
  },
  {
    slug: "credits", label: "Credits & Billing", group: "Your account", title: "Credits & Billing",
    description: "Buy credits. Create what you need. Top up when you need more.",
    sections: [
      { id: "free-and-paid", title: "Free allowance and paid credits", paragraphs: ["The lifetime free allowance is two eligible generations of up to 10 seconds each. It is separate from purchased credits; your project and Credits & Billing show what remains available.", "Credits use one-time packs and manual top-ups. There is no required subscription or automatic recharge. Purchased credits do not expire under the current policy."] },
      { id: "review-cost", title: "Review before spending", paragraphs: ["Your project provides the authoritative credit quote before explicit confirmation. Check the required credits and remaining balance. Quotes expire, and changing the request requires an updated quote.", "Current checkout and paid pricing are for development/testing through PayPal Sandbox. Production prices are not approved; do not treat test pack amounts as Live pricing."] },
      { id: "purchase-history", title: "Check existing purchases", paragraphs: ["Credits & Billing contains the balance, free allowance, top-up controls and purchase history. If a payment is pending or uncertain, check the existing purchase before paying again. Elapsed time alone does not establish failure."], links: [{ label: "Open Credits & Billing", href: "/settings/credits" }] },
    ],
  },
  {
    slug: "earnings", label: "Earnings & Payouts", group: "Your account", title: "Earnings & Payouts",
    description: "Creator earnings are money from paid Marketplace adoptions, separate from AI credits.",
    sections: [
      { id: "creator-earnings", title: "Your creator balance", paragraphs: ["Earnings & Payouts shows available earnings, pending payouts, lifetime earnings and withdrawal history. Refunds and adjustments can affect available funds. AI credits are not withdrawable money."] },
      { id: "withdrawals", title: "Requesting a withdrawal", paragraphs: ["The minimum withdrawal is $5 USD. The requested amount is reserved immediately and held for seven days from the withdrawal request before payout. Refunds may reduce or cancel a pending withdrawal.", "Each withdrawal keeps the private payout destination saved when it was requested. A later email change does not change an existing request. Payouts currently use PayPal Sandbox."] },
      { id: "payout-status", title: "Follow the recorded status", paragraphs: ["Use your existing withdrawal history to follow the recorded outcome. A request or elapsed hold is not proof that money was paid. Pending funds cannot be withdrawn again."], links: [{ label: "Open Earnings & Payouts", href: "/settings/earnings" }] },
    ],
  },
  {
    slug: "settings", label: "Settings & privacy", group: "Your account", title: "Settings & privacy",
    description: "Account controls, creative preferences and appearance in one private place.",
    sections: [
      { id: "account-and-profile", title: "Account and public profile", paragraphs: ["Account and Privacy & Security reuse Clerk’s secure account controls. Available password, connected-account and session options depend on your sign-in method.", "Creator Profile manages your explicitly public Marketplace identity. Projects, credits, earnings and your payout destination are private."], links: [{ label: "Account", href: "/settings/account" }, { label: "Privacy & Security", href: "/settings/privacy" }] },
      { id: "preferences-and-appearance", title: "Preferences and appearance", paragraphs: ["Creation Preferences saves the supported aspect-ratio and category defaults for new drafts. Existing saved or adopted projects keep their own settings.", "Appearance offers Light, Dark and System. Changes apply immediately and are saved in this browser when storage is available."], links: [{ label: "Creation Preferences", href: "/settings/creation" }, { label: "Appearance", href: "/settings/appearance" }] },
      { id: "unavailable-controls", title: "Controls still to come", paragraphs: ["Configurable notification delivery, complete account-data export and account deletion are not available yet. Their Settings sections explain the current limits; they do not provide working switches or destructive actions."], links: [{ label: "Notifications", href: "/settings/notifications" }, { label: "Data & Account", href: "/settings/data" }] },
    ],
  },
];

export function documentationHref(slug: string) {
  return slug === "getting-started" ? "/documentation" : `/documentation/${slug}`;
}

export function findDocumentationTopic(slug: string) {
  return documentationTopics.find(topic => topic.slug === slug);
}
