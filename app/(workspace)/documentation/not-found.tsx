import Link from "next/link";

export default function DocumentationNotFound() {
  return <div className="max-w-2xl space-y-4 py-8">
    <p className="eyebrow">SCEENYK DOCUMENTATION</p>
    <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Topic not found</h1>
    <p className="text-muted-foreground">Choose a topic from the documentation to continue.</p>
    <Link href="/documentation" className="nav-link text-link">Open documentation</Link>
  </div>;
}
