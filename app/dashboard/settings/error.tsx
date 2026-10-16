"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <div className="sceenyk-card space-y-4 p-6"><p role="alert">Your settings couldn’t be loaded. Check your connection and try again.</p><Button variant="outline" onClick={reset}>Reload settings</Button></div>;
}
