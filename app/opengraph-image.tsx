import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Sceenyk — Create the scene you imagine";

// A social card needs a full frame; the transparent wordmark alone is not one.
const logo = `data:image/png;base64,${await readFile(join(process.cwd(), "designs", "sceenyk logo darkmode.png"), "base64")}`;

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{
      width: "100%", height: "100%", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", backgroundColor: "#080B0F",
      border: "16px solid #1E1E28", color: "#F5F5FA",
    }}>
      {/* The supplied artwork is displayed intact, with room for link-preview copy. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logo} alt="" width={900} height={300} style={{ objectFit: "contain" }} />
      <div style={{ fontSize: 42, fontWeight: 600, letterSpacing: -1, marginTop: 12 }}>
        Create the scene you imagine.
      </div>
    </div>,
    size,
  );
}
