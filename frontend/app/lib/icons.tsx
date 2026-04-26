import type { SVGProps } from "react";

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

type Props = SVGProps<SVGSVGElement>;

export const IconLogo = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M4 7l8 4 8-4" />
    <path d="M4 12l8 4 8-4" />
    <path d="M4 17l8 4 8-4" />
  </svg>
);

export const IconPipeline = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M4 6h6a4 4 0 0 1 4 4v4a4 4 0 0 0 4 4h2" />
    <circle cx="3" cy="6" r="1.5" />
    <circle cx="21" cy="18" r="1.5" />
  </svg>
);

export const IconLeads = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M3 5h18" />
    <path d="M3 12h18" />
    <path d="M3 19h18" />
    <circle cx="7" cy="5" r="1" fill="currentColor" />
    <circle cx="7" cy="12" r="1" fill="currentColor" />
    <circle cx="7" cy="19" r="1" fill="currentColor" />
  </svg>
);

export const IconDashboard = (p: Props) => (
  <svg {...base} {...p}>
    <rect x="3" y="3" width="7" height="9" rx="1.5" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="14" y="12" width="7" height="9" rx="1.5" />
    <rect x="3" y="16" width="7" height="5" rx="1.5" />
  </svg>
);

export const IconSettings = (p: Props) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1A1.7 1.7 0 0 0 10 3.1V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </svg>
);

export const IconPlay = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M6 4l14 8-14 8V4z" fill="currentColor" />
  </svg>
);

export const IconUpload = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M12 15V3" />
    <path d="m7 8 5-5 5 5" />
    <path d="M5 21h14" />
  </svg>
);

export const IconDownload = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M12 3v12" />
    <path d="m7 10 5 5 5-5" />
    <path d="M5 21h14" />
  </svg>
);

export const IconRefresh = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M21 12a9 9 0 1 1-3.3-6.9" />
    <path d="M21 4v5h-5" />
  </svg>
);

export const IconSparkle = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />
    <path d="M19 16l.9 2.1L22 19l-2.1.9L19 22l-.9-2.1L16 19l2.1-.9L19 16z" />
  </svg>
);

export const IconClock = (p: Props) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

export const IconMail = (p: Props) => (
  <svg {...base} {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3 7 9 7 9-7" />
  </svg>
);

export const IconSend = (p: Props) => (
  <svg {...base} {...p}>
    <path d="m22 2-20 9 8 3 3 8 9-20z" />
    <path d="m10 14 5-5" />
  </svg>
);

export const IconCalendar = (p: Props) => (
  <svg {...base} {...p}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M8 3v4" />
    <path d="M16 3v4" />
    <path d="M3 11h18" />
  </svg>
);

export const IconArchive = (p: Props) => (
  <svg {...base} {...p}>
    <rect x="3" y="4" width="18" height="4" rx="1" />
    <path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8" />
    <path d="M10 12h4" />
  </svg>
);

export const IconChevron = (p: Props) => (
  <svg {...base} {...p}>
    <path d="m9 18 6-6-6-6" />
  </svg>
);

export const IconSearch = (p: Props) => (
  <svg {...base} {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

export const IconCheck = (p: Props) => (
  <svg {...base} {...p}>
    <path d="m5 12 5 5 9-11" />
  </svg>
);

export const IconDot = (p: Props) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="3.5" fill="currentColor" />
  </svg>
);

export const IconFlame = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M12 2s4 4 4 8a4 4 0 1 1-8 0c0-1 .5-2 1-3-2 1-4 4-4 7a7 7 0 1 0 14 0c0-5-4-9-7-12z" />
  </svg>
);

export const IconTrendingUp = (p: Props) => (
  <svg {...base} {...p}>
    <path d="m3 17 6-6 4 4 8-8" />
    <path d="M14 7h7v7" />
  </svg>
);

export const IconUsers = (p: Props) => (
  <svg {...base} {...p}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2 21a7 7 0 0 1 14 0" />
    <circle cx="17" cy="7" r="2.5" />
    <path d="M22 19a5 5 0 0 0-5-5" />
  </svg>
);

export const IconTarget = (p: Props) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" />
  </svg>
);

export const IconCircle = (p: Props) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="9" />
  </svg>
);

export const IconX = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M6 6l12 12" />
    <path d="M18 6 6 18" />
  </svg>
);

export const IconKey = (p: Props) => (
  <svg {...base} {...p}>
    <circle cx="8" cy="15" r="4" />
    <path d="m11 12 9-9" />
    <path d="m16 7 3 3" />
    <path d="m14 9 3 3" />
  </svg>
);

export const IconBuilding = (p: Props) => (
  <svg {...base} {...p}>
    <rect x="4" y="3" width="16" height="18" rx="2" />
    <path d="M9 7h2" />
    <path d="M13 7h2" />
    <path d="M9 11h2" />
    <path d="M13 11h2" />
    <path d="M9 15h2" />
    <path d="M13 15h2" />
    <path d="M9 21v-3h6v3" />
  </svg>
);

export const IconChat = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M21 11.5a8.38 8.38 0 0 1-9 8.4 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.1A8.38 8.38 0 0 1 12 3a8.5 8.5 0 0 1 9 8.5z" />
  </svg>
);

export const IconLock = (p: Props) => (
  <svg {...base} {...p}>
    <rect x="4" y="11" width="16" height="9" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);

export const IconCopy = (p: Props) => (
  <svg {...base} {...p}>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h10" />
  </svg>
);

export const IconActivity = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
  </svg>
);

export const IconHourglass = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M6 3h12" />
    <path d="M6 21h12" />
    <path d="M7 3v3a5 5 0 0 0 10 0V3" />
    <path d="M7 21v-3a5 5 0 0 1 10 0v3" />
  </svg>
);

export const IconEye = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const IconEyeOff = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M3 3l18 18" />
    <path d="M10.6 6.1A11 11 0 0 1 12 6c6 0 10 6 10 6a17 17 0 0 1-3.3 3.9" />
    <path d="M6.6 6.6A17 17 0 0 0 2 12s4 6 10 6c1.5 0 2.9-.3 4.1-.8" />
    <path d="M14.1 14.1A3 3 0 0 1 9.9 9.9" />
  </svg>
);

export const IconMic = (p: Props) => (
  <svg {...base} {...p}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0" />
    <path d="M12 18v3" />
    <path d="M9 21h6" />
  </svg>
);

export const IconWaveform = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M3 12h2" />
    <path d="M7 8v8" />
    <path d="M11 5v14" />
    <path d="M15 8v8" />
    <path d="M19 11v2" />
    <path d="M21 12h0" />
  </svg>
);

export const IconRoadmap = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M4 19V7a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v12" />
    <path d="M4 19h16" />
    <path d="M9 8h6" />
    <path d="M9 12h6" />
    <path d="M9 16h3" />
  </svg>
);

export const IconTelegram = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M22 3 2 10l7 3 3 7 10-17z" />
    <path d="M22 3 12 13" />
  </svg>
);
