import React from 'react';

interface LogoProps {
  variant?: 'light' | 'dark';
  height?: number;
  className?: string;
  style?: React.CSSProperties;
  showTagline?: boolean;
}

/**
 * Career247 wordmark — "Career" in deep navy, "247" in light blue inside a
 * rounded badge with a vertical separator between 24 and 7. Optional tagline
 * "An AddaEducation Company" with a coral "A" in Adda.
 *
 * Two variants:
 * - `light` (default) — for white / Cloud-White surfaces (pages, modals).
 *   Career text in #1A2961 navy.
 * - `dark` — for navy / indigo surfaces (sidebars, nudge banners). Career
 *   text in white. The 247 badge stays light-blue on both.
 */
export default function Logo({
  variant = 'light',
  height = 36,
  className = '',
  style = {},
  showTagline = false,
}: LogoProps) {
  const careerColor = variant === 'dark' ? '#FFFFFF' : '#1A2961';
  const numberColor = '#2FB7F5';
  const taglineBlack = variant === 'dark' ? '#FFFFFF' : '#0B0B0B';
  const addaCoral = '#E63946';

  // Total viewBox: 320×72 if tagline, 320×56 if not.
  const vbHeight = showTagline ? 72 : 56;

  return (
    <svg
      viewBox={`0 0 320 ${vbHeight}`}
      height={height}
      role="img"
      aria-label="Career247"
      className={className}
      style={{ display: 'block', ...style }}
    >
      {/* "Career" wordmark */}
      <text
        x="0"
        y="40"
        fontFamily="Outfit, system-ui, sans-serif"
        fontWeight="700"
        fontSize="44"
        letterSpacing="-0.02em"
        fill={careerColor}
      >
        Career
      </text>

      {/* 247 badge — rounded outline with internal divider.
          Tightened gap (was 165 → 140) to match the actual Career247 wordmark
          where the badge sits close to "Career", not floating mid-air. */}
      <g transform="translate(140, 8)">
        <rect
          x="0"
          y="0"
          width="100"
          height="44"
          rx="8"
          ry="8"
          fill="none"
          stroke={numberColor}
          strokeWidth="3"
        />
        {/* Vertical divider between 24 and 7 */}
        <line x1="62" y1="6" x2="62" y2="38" stroke={numberColor} strokeWidth="2" />
        <text
          x="6"
          y="34"
          fontFamily="Outfit, system-ui, sans-serif"
          fontWeight="700"
          fontSize="34"
          fill={numberColor}
          letterSpacing="-0.02em"
        >
          24
        </text>
        <text
          x="72"
          y="34"
          fontFamily="Outfit, system-ui, sans-serif"
          fontWeight="700"
          fontSize="34"
          fill={numberColor}
          letterSpacing="-0.02em"
        >
          7
        </text>
      </g>

      {/* Tagline (optional) */}
      {showTagline && (
        <text
          x="0"
          y="66"
          fontFamily="Outfit, system-ui, sans-serif"
          fontWeight="500"
          fontSize="13"
          letterSpacing="0.01em"
        >
          <tspan fill={taglineBlack}>An </tspan>
          <tspan fill={addaCoral} fontWeight="700">A</tspan>
          <tspan fill={taglineBlack} fontWeight="700">dda</tspan>
          <tspan fill={taglineBlack}>Education Company</tspan>
        </text>
      )}
    </svg>
  );
}
