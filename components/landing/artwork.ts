// Supplied public marketing illustrations, never private project assets or
// live Marketplace listings. Keep the user's original filenames.
const artwork = (filename: string) => `/images/${encodeURIComponent(filename)}`;

export const landingArtwork = {
  portrait: artwork("ChatGPT Image Oct 17, 2026, 11_11_56 AM-1.png"),
  landscape: artwork("ChatGPT Image Oct 17, 2026, 11_11_59 AM-2.png"),
  city: artwork("ChatGPT Image Oct 17, 2026, 11_12_01 AM-3.png"),
  moon: artwork("ChatGPT Image Oct 17, 2026, 11_12_04 AM-4.png"),
  underwater: artwork("ChatGPT Image Oct 17, 2026, 11_12_06 AM-5.png"),
  eye: artwork("ChatGPT Image Oct 17, 2026, 11_12_07 AM-6.png"),
  flower: artwork("ChatGPT Image Oct 17, 2026, 11_12_09 AM-7.png"),
  astronaut: artwork("ChatGPT Image Oct 17, 2026, 11_12_12 AM-8.png"),
  explorer: artwork("ChatGPT Image Oct 17, 2026, 11_12_13 AM-9.png"),
  mountains: artwork("ChatGPT Image Oct 17, 2026, 11_12_15 AM-10.png"),
} as const;
