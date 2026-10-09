import { useId } from "react";

export type SceneVariant = "cinematic" | "product" | "gaming";

/** Original vector concept art; not an AI-generated output or playable video. */
export function SceneArtwork({
  variant = "cinematic",
  className,
}: {
  variant?: SceneVariant;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      viewBox="0 0 800 500"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={`${id}-sky`} x2="0.8" y2="1">
          <stop stopColor="var(--neutral-950)" />
          <stop offset="0.55" stopColor="var(--neutral-800)" />
          <stop offset="1" stopColor="var(--brand-purple)" />
        </linearGradient>
        <linearGradient id={`${id}-light`} x2="1" y2="1">
          <stop stopColor="var(--brand-cyan)" />
          <stop offset="0.55" stopColor="var(--brand-blue)" />
          <stop offset="1" stopColor="var(--brand-violet)" />
        </linearGradient>
        <linearGradient id={`${id}-mountain`} x2="0.4" y2="1">
          <stop stopColor="var(--brand-purple)" />
          <stop offset="1" stopColor="var(--neutral-950)" />
        </linearGradient>
        <radialGradient id={`${id}-halo`}>
          <stop stopColor="var(--brand-purple)" stopOpacity="0.65" />
          <stop offset="1" stopColor="var(--brand-purple)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="800" height="500" fill={`url(#${id}-sky)`} />
      <ellipse cx="480" cy="210" rx="310" ry="260" fill={`url(#${id}-halo)`} />
      {variant === "cinematic" && (
        <>
          <circle cx="475" cy="200" r="109" fill={`url(#${id}-light)`} />
          <circle cx="452" cy="172" r="108" fill={`url(#${id}-sky)`} />
          <ellipse
            cx="468"
            cy="208"
            rx="202"
            ry="49"
            fill="none"
            stroke="var(--brand-violet)"
            strokeWidth="2"
            transform="rotate(-28 468 208)"
          />
          <ellipse
            cx="468"
            cy="208"
            rx="218"
            ry="55"
            fill="none"
            stroke="var(--brand-blue)"
            strokeOpacity="0.35"
            transform="rotate(-28 468 208)"
          />
          <path
            d="M0 380 125 233 256 359 370 278 566 405 688 270 800 350V500H0Z"
            fill={`url(#${id}-mountain)`}
          />
          <path
            d="M0 426 180 364 274 436 442 343 574 453 800 361V500H0Z"
            fill="var(--neutral-950)"
          />
          <path
            d="m180 364 94 72 168-93"
            fill="none"
            stroke="var(--brand-purple)"
            strokeOpacity="0.5"
          />
          <path
            d="M428 380 392 500H481L452 380Z"
            fill={`url(#${id}-light)`}
            opacity="0.5"
          />
        </>
      )}
      {variant === "product" && (
        <>
          <ellipse
            cx="400"
            cy="410"
            rx="224"
            ry="35"
            fill="var(--neutral-950)"
          />
          <ellipse
            cx="400"
            cy="384"
            rx="224"
            ry="34"
            fill="var(--brand-purple)"
          />
          <path
            d="M176 384v28c0 46 448 46 448 0v-28c-65 43-383 43-448 0"
            fill="var(--neutral-800)"
          />
          <ellipse
            cx="400"
            cy="384"
            rx="224"
            ry="34"
            fill="none"
            stroke="var(--brand-violet)"
          />
          <g transform="rotate(-12 400 230)">
            <rect
              x="344"
              y="120"
              width="112"
              height="258"
              rx="36"
              fill={`url(#${id}-light)`}
            />
            <rect
              x="359"
              y="88"
              width="82"
              height="47"
              rx="10"
              fill="var(--neutral-700)"
            />
            <path
              d="M365 148v176"
              stroke="var(--white)"
              strokeOpacity="0.55"
              strokeWidth="5"
              strokeLinecap="round"
            />
            <rect
              x="344"
              y="208"
              width="112"
              height="88"
              fill="var(--neutral-950)"
              fillOpacity="0.75"
            />
            <path
              d="m400 232 5 13 13 5-13 5-5 13-5-13-13-5 13-5Z"
              fill="var(--white)"
            />
          </g>
          <ellipse
            cx="400"
            cy="251"
            rx="249"
            ry="125"
            fill="none"
            stroke="var(--brand-cyan)"
            strokeOpacity="0.4"
            transform="rotate(-25 400 251)"
          />
        </>
      )}
      {variant === "gaming" && (
        <>
          <circle cx="405" cy="220" r="126" fill={`url(#${id}-light)`} />
          {Array.from({ length: 8 }, (_, i) => (
            <rect
              key={i}
              x="255"
              y={240 + i * 13}
              width="300"
              height={4 + i}
              fill="var(--neutral-950)"
            />
          ))}
          <path
            d="M0 420V150H76V330H111V230H162V362H214V296H271V420H529V310H588V248H660V363H707V131H775V420H800V500H0Z"
            fill="var(--neutral-950)"
          />
          <path
            d="M0 420H800M0 451H800M0 495H800M400 420 95 500M400 420 245 500M400 420V500M400 420 555 500M400 420 705 500"
            fill="none"
            stroke="var(--brand-purple)"
            strokeOpacity="0.65"
          />
          <path
            d="M20 175V330M137 248V333M732 159V369M560 329V383"
            stroke="var(--brand-cyan)"
            strokeWidth="3"
          />
        </>
      )}
      {[
        [85, 78],
        [194, 126],
        [671, 74],
        [735, 200],
        [303, 55],
        [578, 98],
      ].map(([cx, cy], i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r={i % 2 ? 1.5 : 2.5}
          fill="var(--white)"
          opacity="0.65"
        />
      ))}
    </svg>
  );
}
