import { useId } from 'react';

interface MascotProps {
  /** Rendered height in px (width scales by aspect). */
  size?: number;
  /** face = head only (badges, small spots); full = head + waving body. */
  variant?: 'face' | 'full';
  /** SMIL micro-animations: eye blink, antenna pulse, waving arm. */
  animated?: boolean;
  className?: string;
}

// Brand constants (identical in dark & light themes — the face display is a
// dark LCD in both, exactly like the app's real readouts).
const AMBER = '#f5a623';
const AMBER_DEEP = '#e08c0b';
const AMBER_EDGE = '#b06f08';
const AMBER_DIM = '#c47d0e';
const TEAL = '#3dd9c4';
const DARK = '#0b0d11';

/**
 * "Volt" — FixMaster's bench-bot mascot. Built ONLY from the product's own
 * visual idioms (Precision Electronics Bench): the head is an amber
 * instrument plate with corner screws and dial "ears", the face is a dark
 * readout display with glowing LED eyes, the antenna is a live status LED,
 * and the chest plate carries the brand bolt. No generic clipart.
 */
export function Mascot({ size = 96, variant = 'face', animated = true, className }: MascotProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const plateId = `volt-plate-${uid}`;
  const sheenId = `volt-sheen-${uid}`;
  const glowId = `volt-glow-${uid}`;

  const isFull = variant === 'full';
  const vbH = isFull ? 176 : 124;
  const width = Math.round((size * 120) / vbH);

  return (
    <svg
      viewBox={`0 0 120 ${vbH}`}
      width={width}
      height={size}
      className={className}
      role="img"
      aria-hidden
      fill="none"
    >
      <defs>
        <linearGradient id={plateId} x1="10" y1="24" x2="110" y2="114" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#f7b23e" />
          <stop offset="100%" stopColor={AMBER_DEEP} />
        </linearGradient>
        <linearGradient id={sheenId} x1="10" y1="24" x2="110" y2="114" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <filter id={glowId} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* ----- Antenna: live status LED (matches .ledLive idiom) ----- */}
      <rect x="57.5" y="13" width="5" height="13" rx="2" fill={AMBER_DIM} />
      <circle cx="60" cy="10" r="5" fill={TEAL} filter={`url(#${glowId})`}>
        {animated && (
          <animate attributeName="opacity" values="1;0.55;1" dur="1.8s" repeatCount="indefinite" />
        )}
      </circle>

      {/* ----- Head: amber instrument plate + corner screws + dial ears ----- */}
      <rect x="2" y="58" width="8" height="22" rx="4" fill={AMBER_DIM} />
      <rect x="110" y="58" width="8" height="22" rx="4" fill={AMBER_DIM} />
      <rect x="10" y="24" width="100" height="90" rx="20" fill={`url(#${plateId})`} stroke={AMBER_EDGE} strokeWidth="1.5" />
      <rect x="10" y="24" width="100" height="90" rx="20" fill={`url(#${sheenId})`} />
      {/* screws (45° slot, same as .screw) */}
      <g opacity="0.55">
        <circle cx="24" cy="38" r="3.6" fill={DARK} />
        <line x1="21.8" y1="35.8" x2="26.2" y2="40.2" stroke={AMBER} strokeWidth="1.1" />
        <circle cx="96" cy="38" r="3.6" fill={DARK} />
        <line x1="93.8" y1="35.8" x2="98.2" y2="40.2" stroke={AMBER} strokeWidth="1.1" />
      </g>

      {/* ----- Face: dark readout display with LED eyes + smile ----- */}
      <rect x="24" y="48" width="72" height="46" rx="10" fill={DARK} />
      <rect x="24.75" y="48.75" width="70.5" height="44.5" rx="9.25" stroke={TEAL} strokeOpacity="0.22" strokeWidth="1.5" />
      <ellipse cx="45" cy="66" rx="7" ry="7" fill={TEAL} filter={`url(#${glowId})`}>
        {animated && (
          <animate attributeName="ry" values="7;0.9;7" keyTimes="0;0.5;1" dur="0.22s" begin="2.4s;5.9s;9.8s;13.1s" />
        )}
      </ellipse>
      <ellipse cx="75" cy="66" rx="7" ry="7" fill={TEAL} filter={`url(#${glowId})`}>
        {animated && (
          <animate attributeName="ry" values="7;0.9;7" keyTimes="0;0.5;1" dur="0.22s" begin="2.4s;5.9s;9.8s;13.1s" />
        )}
      </ellipse>
      <path d="M45 79 Q60 89 75 79" stroke={AMBER} strokeWidth="3.5" strokeLinecap="round" />

      {/* chin ticks (tick-gauge idiom) */}
      <g stroke={AMBER_EDGE} strokeWidth="2" strokeLinecap="round" opacity="0.7">
        <line x1="48" y1="102" x2="48" y2="107" />
        <line x1="60" y1="102" x2="60" y2="107" />
        <line x1="72" y1="102" x2="72" y2="107" />
      </g>

      {isFull && (
        <g>
          {/* neck + body plate */}
          <rect x="52" y="114" width="16" height="8" fill={AMBER_DIM} />
          {/* left arm (resting) */}
          <path d="M26 132 Q12 140 14 152" stroke={AMBER_DIM} strokeWidth="8" strokeLinecap="round" />
          <circle cx="14" cy="153" r="5" fill={AMBER_DEEP} />
          {/* right arm (waving) */}
          <g>
            {animated && (
              <animateTransform
                attributeName="transform"
                type="rotate"
                values="0 94 132;0 94 132;14 94 132;-6 94 132;14 94 132;0 94 132;0 94 132"
                keyTimes="0;0.55;0.65;0.75;0.85;0.95;1"
                dur="5s"
                repeatCount="indefinite"
              />
            )}
            <path d="M94 132 Q108 124 111 110" stroke={AMBER_DIM} strokeWidth="8" strokeLinecap="round" />
            <circle cx="111.5" cy="108" r="5.5" fill={AMBER_DEEP} />
          </g>
          <rect x="24" y="120" width="72" height="42" rx="14" fill={`url(#${plateId})`} stroke={AMBER_EDGE} strokeWidth="1.5" />
          <rect x="24" y="120" width="72" height="42" rx="14" fill={`url(#${sheenId})`} />
          {/* chest display carrying the brand bolt */}
          <rect x="42" y="129" width="36" height="22" rx="5" fill={DARK} />
          <path d="M63.5 131.5 L55 142 H60 L56.5 148.5 L65 138 H60 Z" fill={AMBER} filter={`url(#${glowId})`} />
          {/* feet */}
          <rect x="36" y="162" width="18" height="8" rx="4" fill={AMBER_DIM} />
          <rect x="66" y="162" width="18" height="8" rx="4" fill={AMBER_DIM} />
        </g>
      )}
    </svg>
  );
}
