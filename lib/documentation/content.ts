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
    description: "Create short AI videos, reuse creator templates, and manage your projects, purchases and credits.",
    sections: [
      { id: "what-is-sceenyk", title: "What is Sceenyk?", paragraphs: ["Sceenyk helps you create short AI videos from scene descriptions and image references. Studio guides you through reference sheets, a Location, a Storyboard, cost review and final video generation. Marketplace offers reusable creator templates you can adapt into your own projects.", "You can explore Studio and browse Marketplace without signing in. Save projects, upload private references, generate videos and adopt templates with an account."] },
      { id: "quick-start", title: "Create your first video", paragraphs: ["Open Studio, use UGC, name your project and describe the scene. Add and name your Character image and the Product or Prop reference your scene needs. Save the project and wait for its uploads to finish.", "Generate and approve the reference sheets, Location and Storyboard. In Workflow, build the Package & Estimates and approve the Generation Package. Choose Generate Final Video, then watch the result in Preview and choose Approve Final Video when you are satisfied."], links: [{ label: "Open Studio", href: "/studio" }, { label: "Step-by-step Studio guide", href: "/documentation/studio" }, { label: "Your projects", href: "/projects" }] },
      { id: "before-generation", title: "What to expect from this MVP", paragraphs: ["New video generation currently supports 5 seconds at 480p. Longer durations and higher resolutions shown in the interface are not available for new requests. A generated video still needs your final approval before it is marked Complete.", "Saving or opening a project does not start generation. Review each action and its credit requirement. Service availability and spending limits can pause generation even when you have credits. Current checkout and payout flows use PayPal Sandbox test money; live payments are not enabled."], links: [{ label: "Credits guide", href: "/documentation/credits" }, { label: "Marketplace guide", href: "/documentation/marketplace" }] },
    ],
  },
  {
    slug: "studio", label: "Studio", group: "Your workspace", title: "Studio",
    description: "Follow your idea from saved references to a reviewed final video.",
    sections: [
      { id: "creative-direction", title: "1. Set your creative direction", paragraphs: ["Use UGC for the current video-generation workflow. In Sources, give the project a title. In Properties, describe the action, setting and any dialogue, narration or silence you want. Choose the aspect ratio, Visual Style, Tone and Type, keeping the current 5-second/480p output limits.", "Basic and Pro are Studio modes. Basic works with one Character; Pro offers per-character references and additional presentation controls. Switching modes does not grant credits or unlock longer or higher-resolution generation. New Freestyle and video-to-video generation are not connected."] },
      { id: "sources", title: "2. Save and prepare your references", paragraphs: ["Add a clear Character image and give it a name. Add and name a Product or Prop image when needed. Save your project and wait for upload confirmation. A local preview is temporary and is not proof that a file has been saved.", "Open each source’s sheet controls, generate its reference sheet and review it before approving. Generate and approve Location, then use Workflow → Storyboard to generate and approve the scene plan. Changing saved creative inputs can make dependent work stale; follow the current review controls before continuing."] },
      { id: "generation-status", title: "3. Build and approve the package", paragraphs: ["Open Workflow → Package & Estimates and choose Build package and estimate. Review the package’s duration, aspect ratio, resolution, credit information and automatically calculated spending limit. Choose Approve Generation Package to confirm that exact package.", "Package approval does not start a video or reserve its credits. Generate Final Video performs the funding and availability checks. If you change the inputs before they are locked, rebuild and approve the updated work."], links: [{ label: "Credits & Billing", href: "/credits" }] },
      { id: "final-video", title: "4. Generate, watch and approve", paragraphs: ["Open Final Video and choose Generate Final Video once. Accepted jobs are saved and continue in the background; you can leave Studio and return through Projects to check Progress.", "When Ready for review appears, choose View in Preview and watch the video. Choose Approve Final Video to mark the project Complete. Reject and Delete removes that result after confirmation; another video requires new approval, an explicit Generate action and eligible funding. Approved creative inputs remain read-only."] },
      { id: "recover-work", title: "If generation pauses or fails", paragraphs: ["Open Progress and check the existing request before starting anything new. Use Check status or Recover saved work when offered. Recovery can finish saving an already generated video without buying another provider request.", "A timeout or failed save does not prove that generation never started. A completed provider request can still use credits even if later validation or storage needs recovery. Do not repeatedly click Generate or assume that deleting a project restores a free allowance."], links: [{ label: "Your projects", href: "/projects" }, { label: "Credits guide", href: "/documentation/credits" }] },
    ],
  },
  {
    slug: "projects-templates", label: "Projects & templates", group: "Your workspace", title: "Projects & templates",
    description: "Keep private drafts separate from the reusable configurations you share.",
    sections: [
      { id: "saved-projects", title: "Save and resume", paragraphs: ["Projects contains your private saved projects. Open one to resume its brief, uploaded references, generation progress or approved video. Saving a draft does not generate a video.", "Eligible approved final videos can show silent, looping three-second card previews. Open a project to watch its full approved video. Previews may take time to prepare; a static cover does not mean your saved video was lost."], links: [{ label: "Open Projects", href: "/projects" }] },
      { id: "template-library", title: "Your template gallery", paragraphs: ["Templates contains your own reusable listings, including drafts, published, unpublished and archived items. Choose New Template to start from an owned project, or open an existing template and choose Update Template to manage it.", "Eligible completed templates can show approved-video previews. Drafts, missing previews and unavailable media keep a static cover. Templates you acquire from other creators are in Purchases, rather than your creator Templates gallery."], links: [{ label: "Open Templates", href: "/templates" }, { label: "Manage templates", href: "/settings/templates" }] },
      { id: "adopted-work", title: "Adopted templates are your own projects", paragraphs: ["Adoption gives you reusable instructions and supported creative settings in a project you own. Replace or refine the prompt and add your own references, then follow the normal Studio review and generation workflow.", "The creator keeps the original project. Their private uploads, reference sheets, Storyboard and generated files are not copied into your project. Adoption does not generate a video or include future AI usage."], links: [{ label: "Marketplace guide", href: "/documentation/marketplace" }] },
      { id: "purchases-library", title: "Find and reuse your purchases", paragraphs: ["Open Purchases for templates you acquired free or through a verified paid checkout. Open an item to review its saved instructions, settings and purchase details, then choose Create your version to open your adopted project.", "If that adopted project was deleted, the existing purchase can create a clean replacement without buying the same template again. A listing that is no longer available may have limited preview or adoption access; check its recorded status."], links: [{ label: "Open Purchases", href: "/purchases" }, { label: "Marketplace payment history", href: "/marketplace/purchases" }] },
    ],
  },
  {
    slug: "marketplace", label: "Marketplace", group: "Discover & share", title: "Marketplace",
    description: "Explore reusable creator templates, adopt a starting point or publish your own approach.",
    sections: [
      { id: "discover", title: "Find a starting point", paragraphs: ["Browse Marketplace, search titles, descriptions or tags, and filter by category. Open a listing to review its reusable instructions, supported settings, creator and Free or paid adoption price. Creator links open public storefronts.", "Listings with eligible approved media offer video previews. Other listings keep a static cover. Landing-page inspiration artwork is illustrative and is not a promise that a particular template is for sale."], links: [{ label: "Explore Marketplace", href: "/marketplace" }] },
      { id: "adoption", title: "Adopt a free or paid template", paragraphs: ["Sign in and choose Adopt template on a free listing. For a paid listing, review the purchase and approve its PayPal checkout. Paid adoption currently supports prices from $1 to $25 USD and uses Sandbox test money.", "The adoption price pays for access to the template, not AI generation. Your new project still needs its own inputs, approvals and free allowance or credits. If checkout is uncertain, check the existing purchase before paying again."], links: [{ label: "Your Purchases", href: "/purchases" }, { label: "Check Marketplace payments", href: "/marketplace/purchases" }] },
      { id: "publishing", title: "Publish your own template", paragraphs: ["In Projects, choose Publish to open the template editor for a project you own. You can also choose New Template in Templates. Review the reusable configuration and public instructions, add a title, description, category and tags, then choose Free or a supported price.", "Confirm your rights and review the listing preview before choosing Publish to Marketplace. Private uploads are not handed to adopters; the public listing can display the reviewed preview of your work. Keep personal details, access keys and private links out of public instructions.", "Manage listings in Settings → Templates. You can edit listing metadata, unpublish, archive or use the available deletion controls. Published reusable instructions are fixed; listing metadata can still be edited. Draft and unpublished listings do not appear in public discovery."], links: [{ label: "Manage listings", href: "/settings/templates" }, { label: "Creator Profile", href: "/settings/creator-profile" }] },
    ],
  },
  {
    slug: "credits", label: "Credits & Billing", group: "Your account", title: "Credits & Billing",
    description: "Understand included projects, generation costs and one-time credit top-ups.",
    sections: [
      { id: "free-and-paid", title: "Two lifetime free AI projects", paragraphs: ["Each account has two lifetime free AI-project allowances. Creating or saving an empty project is free; an allowance is used when its first AI request starts. Deleting a used project or signing in again does not reset it.", "An eligible included project has supported reference and Storyboard preparation plus one 5-second/480p video. Further video attempts need eligible funding. Credits & Billing and Studio show your actual allowance and any usage that needs review; purchased credits stay separate."] },
      { id: "review-cost", title: "Understand generation credits", paragraphs: ["When paid credits are required, each actual reference or Storyboard preparation request costs 1 credit. A fresh Location uses separate planning and image requests, normally 2 credits. The current paid 5-second/480p video costs 103 credits. Included preparation on eligible free projects costs no credits.", "Review the current package and spending limit before approval. Credits are reserved when generation is admitted and consumed when the paid provider work completes. Reloading, checking status or recovering the same saved result does not buy another generation. A provider-completed result can still need storage recovery."] },
      { id: "purchase-history", title: "Top up and check payment status", paragraphs: ["Open Credits & Billing, enter a custom USD amount and review the estimated payment fees, Sceenyk commission and credits you will receive. Continue to PayPal and approve the existing checkout. Credits appear only after the payment is verified.", "Top-ups are one-time purchases, with no automatic recharge or recurring generation subscription. Purchased credits do not expire under the current policy. The current payment integration uses PayPal Sandbox test money, not live charges.", "Use Check purchases and the saved purchase history if a return from PayPal is pending or uncertain. Available credits, reserved credits and credit activity are shown separately. Do not start a second payment just because the browser response was interrupted."], links: [{ label: "Open Credits & Billing", href: "/credits" }] },
    ],
  },
  {
    slug: "earnings", label: "Earnings & Payouts", group: "Your account", title: "Earnings & Payouts",
    description: "Follow Marketplace sales, available earnings and Sandbox payout requests separately from AI credits.",
    sections: [
      { id: "creator-earnings", title: "Understand your creator balance", paragraphs: ["New paid Marketplace adoptions allocate 90% to the creator and 10% to the platform. Earnings & Payouts shows your recorded sales, available earnings, pending payouts and withdrawal history. Sales must settle before earnings become available; refunds and adjustments can change the balance.", "Creator earnings are separate from AI credits and cannot be topped up or spent as generation credits. Current sales and payouts use PayPal Sandbox test money. These records demonstrate the earning workflow, not live cash income."] },
      { id: "withdrawals", title: "Request a withdrawal", paragraphs: ["Open Earnings & Payouts and save your private PayPal payout email. Enter at least $5 USD, up to your available earnings, then choose Request Withdrawal. The requested funds are reserved immediately and held for seven days from the request before payout checks.", "Each withdrawal keeps the payout email saved when it was requested; changing your email later does not redirect an existing request. Refunds can reduce or cancel a pending withdrawal. Payout processing must be available before a request can finish."] },
      { id: "payout-status", title: "Follow the recorded status", paragraphs: ["Read Payout History for the hold date and pending, eligible, processing, paid or failed status. A request or an elapsed hold is not proof of payment. Reserved funds cannot be withdrawn again while their outcome is unresolved."], links: [{ label: "Open Earnings & Payouts", href: "/credits/earnings" }] },
    ],
  },
  {
    slug: "settings", label: "Settings & privacy", group: "Your account", title: "Settings & privacy",
    description: "Account controls, creative preferences and appearance in one private place.",
    sections: [
      { id: "account-and-profile", title: "Account and public profile", paragraphs: ["Open Settings → Account or Privacy & Security for Clerk’s secure account controls. Password, connected-account and session options depend on your sign-in method.", "Creator Profile lets you manage your public display name, creator slug, avatar and biography for Marketplace. Private project sources, credits, earnings and payout details remain separate from that public profile."], links: [{ label: "Account", href: "/settings/account" }, { label: "Creator Profile", href: "/settings/creator-profile" }, { label: "Privacy & Security", href: "/settings/privacy" }] },
      { id: "preferences-and-appearance", title: "Preferences and appearance", paragraphs: ["Creation Preferences saves the supported aspect-ratio and category defaults for new drafts. Existing saved or adopted projects keep their own settings.", "Appearance offers Light, Dark and System. Changes apply immediately and are saved in this browser when storage is available."], links: [{ label: "Creation Preferences", href: "/settings/creation" }, { label: "Appearance", href: "/settings/appearance" }] },
      { id: "unavailable-controls", title: "Notifications and current limits", paragraphs: ["In-app notices report actions, errors and recovery options. Check saved generation progress in your project, payment history in Credits & Billing and withdrawal status in Earnings & Payouts.", "Configurable email or push notification delivery, a complete account-data export and account deletion are not available. Their Settings sections explain the limits; there are no working delivery switches or account-deletion actions."], links: [{ label: "Notifications", href: "/settings/notifications" }, { label: "Data & Account", href: "/settings/data" }] },
    ],
  },
];

export function documentationHref(slug: string) {
  return slug === "getting-started" ? "/documentation" : `/documentation/${slug}`;
}

export function findDocumentationTopic(slug: string) {
  return documentationTopics.find(topic => topic.slug === slug);
}
