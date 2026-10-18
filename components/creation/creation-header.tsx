export function CreationHeader({ saved = false }: { saved?: boolean }) {
  return <h1 className="sr-only">Sceenyk Studio{saved ? " — Project draft" : ""}</h1>;
}
