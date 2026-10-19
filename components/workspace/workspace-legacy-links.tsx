"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// URL fragments never reach the server. Browsers carry them through the
// /dashboard -> /studio redirect; keep old saved project/template links useful.
export function WorkspaceLegacyLinks() {
  const router = useRouter();
  useEffect(() => {
    function restoreBookmark() {
      if (location.hash === "#projects") {
        router.replace(`/projects${location.search}${location.hash}`);
      } else if (location.hash === "#templates") {
        router.replace(`/templates${location.search}`);
      } else if (location.hash === "#credits") {
        router.replace("/settings/credits");
      }
    }
    restoreBookmark();
    window.addEventListener("hashchange", restoreBookmark);
    return () => window.removeEventListener("hashchange", restoreBookmark);
  }, [router]);
  return null;
}
