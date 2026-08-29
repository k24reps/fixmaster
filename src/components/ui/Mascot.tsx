import { useEffect, useId, useState } from 'react';

interface MascotProps {
  /** Rendered height in px (width follows the probe silhouette). */
  size?: number;
  /** face = compact instrument; full = instrument + lead, connector, and magnetic feet. */
  variant?: 'face' | 'full';
  /** SMIL micro-motion for the live probe and diagnostic waveform. */
  animated?: boolean;
  className?: string;
}

const AMBER = 'var(--brand-500)';
const AMBER_DEEP = 'var(--brand-700)';
const CYAN = 'var(--accent-500)';
const SHELL = 'var(--volt-shell)';
const SHELL_HIGH = 'var(--volt-shell-high)';
const EDGE = 'var(--volt-edge)';
const DISPLAY = 'var(--volt-display)';
const METAL = 'var(--volt-metal)';

function getReducedMotionPreference() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * VOLT Probe — FixMaster's diagnostic bench companion.
 *
 * The silhouette is a purpose-built continuity tester: asymmetric live probe,
 * dark waveform readout, amber rotary dial, coiled test lead, and magnetic
 * feet. It stays inside the Precision Electronics Bench language without
 * implying a generic AI/chatbot.
 */
export function Mascot({ size = 96, variant = 'face', animated = true, className }: MascotProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [reduceMotion, setReduceMotion] = useState(getReducedMotionPreference);
  const shellId = `volt-shell-${uid}`;
  const amberId = `volt-amber-${uid}`;
  const glowId = `volt-glow-${uid}`;

  const isFull = variant === 'full';
  const shouldAnimate = animated && !reduceMotion;
  const viewWidth = isFull ? 148 : 112;
  const viewHeight = isFull ? 176 : 148;
  const viewBox = isFull ? '0 0 148 176' : '18 2 112 148';
  const width = Math.round((size * viewWidth) / viewHeight);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = (event: MediaQueryListEvent) => setReduceMotion(event.matches);
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  return (
    <svg
      viewBox={viewBox}
      width={width}
      height={size}
      className={className}
      aria-hidden="true"
      focusable="false"
      fill="none"
    >
      <defs>
        <linearGradient id={shellId} x1="34" y1="30" x2="108" y2="148" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={SHELL_HIGH} />
          <stop offset="1" stopColor={SHELL} />
        </linearGradient>
        <linearGradient id={amberId} x1="30" y1="34" x2="52" y2="146" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={AMBER} />
          <stop offset="1" stopColor={AMBER_DEEP} />
        </linearGradient>
        <filter id={glowId} x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.8" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {isFull && (
        <g aria-hidden="true">
          {/* Coiled continuity lead: recognisable at illustration size, omitted in compact spots. */}
          <path
            d="M106 103 C134 101 143 116 139 134 C136 149 126 156 114 160"
            stroke={EDGE}
            strokeWidth="10"
            strokeLinecap="round"
          />
          <path
            d="M106 103 C134 101 143 116 139 134 C136 149 126 156 114 160"
            stroke={SHELL}
            strokeWidth="5.5"
            strokeLinecap="round"
            strokeDasharray="4 4"
          />
          <path d="M111 154 L122 158 L118 167 L107 163 Z" fill={AMBER} stroke={AMBER_DEEP} strokeWidth="1.4" />
          <path d="M121 159 L130 162" stroke={METAL} strokeWidth="3" strokeLinecap="round" />
        </g>
      )}

      {/* Asymmetric test probe: the primary silhouette cue. */}
      <g transform="rotate(-18 43 30)">
        {shouldAnimate && (
          <animateTransform
            attributeName="transform"
            type="rotate"
            values="-18 43 30;-14 43 30;-18 43 30"
            dur="3.2s"
            repeatCount="indefinite"
          />
        )}
        <rect x="39" y="12" width="8" height="29" rx="3" fill={SHELL_HIGH} stroke={EDGE} strokeWidth="1.3" />
        <rect x="40.5" y="5" width="5" height="13" rx="2" fill={AMBER} />
        <path d="M43 1 L46 6 H40 Z" fill={METAL} />
        <rect x="36.5" y="34" width="13" height="10" rx="4" fill={SHELL} stroke={AMBER_DEEP} strokeWidth="1.5" />
        <circle cx="43" cy="4" r="2.3" fill={CYAN} filter={`url(#${glowId})`}>
          {shouldAnimate && (
            <animate attributeName="opacity" values="1;0.38;1" dur="1.7s" repeatCount="indefinite" />
          )}
        </circle>
      </g>

      {/* Graphite diagnostic chassis with one amber grip/spine. */}
      <path
        d="M43 27 H92 L108 43 V134 L96 149 H45 L29 136 V45 Z"
        fill={`url(#${shellId})`}
        stroke={EDGE}
        strokeWidth="1.8"
      />
      <path d="M29 48 L40 34 V141 L29 134 Z" fill={`url(#${amberId})`} />
      <path d="M40 34 L43 29 V146 L40 141 Z" fill={AMBER_DEEP} opacity="0.72" />

      {/* Recessed LCD: expression is diagnostic signal, not a cartoon face. */}
      <path
        d="M48 45 H91 L99 53 V91 L92 99 H47 L39 91 V54 Z"
        fill={DISPLAY}
        stroke={CYAN}
        strokeOpacity="0.34"
        strokeWidth="1.5"
      />
      <path
        d="M47 72 H54 L59 61 L66 83 L73 66 L80 76 L86 70 H93"
        stroke={CYAN}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter={`url(#${glowId})`}
      >
        {shouldAnimate && (
          <animate attributeName="opacity" values="0.58;1;0.58" dur="2.1s" repeatCount="indefinite" />
        )}
      </path>
      <g fill={CYAN} opacity="0.72">
        <rect x="49" y="88" width="8" height="2" rx="1" />
        <rect x="61" y="88" width="4" height="2" rx="1" />
        <rect x="69" y="88" width="12" height="2" rx="1" />
        <rect x="85" y="88" width="6" height="2" rx="1" />
      </g>

      {/* Serviceable faceplate details. */}
      <g stroke={METAL} strokeWidth="1.1" opacity="0.72">
        <circle cx="48" cy="37" r="3.2" fill={SHELL} />
        <line x1="46" y1="35" x2="50" y2="39" />
        <circle cx="96" cy="42" r="3.2" fill={SHELL} />
        <line x1="94" y1="40" x2="98" y2="44" />
      </g>

      {/* Amber selector dial + calibration ticks. */}
      <g stroke={AMBER_DEEP} strokeWidth="1.6" strokeLinecap="round">
        <line x1="55" y1="109" x2="58" y2="112" />
        <line x1="63" y1="104" x2="64" y2="108" />
        <line x1="80" y1="104" x2="79" y2="108" />
        <line x1="88" y1="109" x2="85" y2="112" />
      </g>
      <circle cx="72" cy="122" r="14" fill={DISPLAY} stroke={EDGE} strokeWidth="1.5" />
      <circle cx="72" cy="122" r="10" fill={AMBER} stroke={AMBER_DEEP} strokeWidth="1.5" />
      <path d="M72 122 L78 114" stroke={DISPLAY} strokeWidth="2.4" strokeLinecap="round" />

      <text
        x="88"
        y="136"
        fill={METAL}
        fontFamily="var(--font-mono)"
        fontSize="6.5"
        fontWeight="700"
        textAnchor="middle"
      >
        V-01
      </text>

      {isFull && (
        <g>
          {/* Magnetic bench feet keep the character grounded without humanoid legs. */}
          <path d="M42 148 H61 V156 H38 V153 Z" fill={SHELL} stroke={EDGE} strokeWidth="1.4" />
          <path d="M78 148 H97 L101 153 V156 H76 V152 Z" fill={SHELL} stroke={EDGE} strokeWidth="1.4" />
          <rect x="39" y="156" width="23" height="4" rx="2" fill={AMBER_DEEP} />
          <rect x="77" y="156" width="24" height="4" rx="2" fill={AMBER_DEEP} />
        </g>
      )}
    </svg>
  );
}
