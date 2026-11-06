import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;

function Base({ children, ...props }: P) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      width={20}
      height={20}
      {...props}
    >
      {children}
    </svg>
  );
}

export const IconLocate = (p: P) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="3.2" />
    <circle cx="12" cy="12" r="7.5" />
    <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22" />
  </Base>
);
export const IconPin = (p: P) => (
  <Base {...p}>
    <path d="M12 21s-7-6.4-7-11.5a7 7 0 0 1 14 0C19 14.6 12 21 12 21Z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </Base>
);
export const IconSearch = (p: P) => (
  <Base {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.2-4.2" />
  </Base>
);
export const IconPlus = (p: P) => (
  <Base {...p}>
    <path d="M12 5v14M5 12h14" />
  </Base>
);
export const IconTrash = (p: P) => (
  <Base {...p}>
    <path d="M4 7h16M9 7V5h6v2M6.5 7l1 12.5h9l1-12.5M10 11v5M14 11v5" />
  </Base>
);
export const IconEdit = (p: P) => (
  <Base {...p}>
    <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" />
    <path d="m13.5 6.5 4 4" />
  </Base>
);
export const IconCheck = (p: P) => (
  <Base {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Base>
);
export const IconX = (p: P) => (
  <Base {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Base>
);
export const IconChevron = (p: P) => (
  <Base {...p}>
    <path d="m9 6 6 6-6 6" />
  </Base>
);
export const IconHome = (p: P) => (
  <Base {...p}>
    <path d="M4 10.5 12 4l8 6.5V20h-5.5v-5.5h-5V20H4v-9.5Z" />
  </Base>
);
export const IconUsers = (p: P) => (
  <Base {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" />
    <circle cx="17" cy="9.5" r="2.4" />
    <path d="M16 14.2c2.3.2 4 1.8 4.5 4.3" />
  </Base>
);
export const IconUser = (p: P) => (
  <Base {...p}>
    <circle cx="12" cy="8.5" r="3.5" />
    <path d="M5 20c.8-3.8 3.6-6 7-6s6.2 2.2 7 6" />
  </Base>
);
export const IconMap = (p: P) => (
  <Base {...p}>
    <path d="m3.5 6.5 5.5-2 6 2 5.5-2v13l-5.5 2-6-2-5.5 2v-13Z" />
    <path d="M9 4.5v13M15 6.5v13" />
  </Base>
);
export const IconAlert = (p: P) => (
  <Base {...p}>
    <path d="M12 3.5 2.8 19.5h18.4L12 3.5Z" />
    <path d="M12 10v4M12 17v.01" />
  </Base>
);
export const IconInfo = (p: P) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5.5M12 7.8v.01" />
  </Base>
);
export const IconShield = (p: P) => (
  <Base {...p}>
    <path d="M12 3 5 6v5.5c0 4.4 3 7.9 7 9.5 4-1.6 7-5.1 7-9.5V6l-7-3Z" />
    <path d="m9 12 2.2 2.2L15.5 10" />
  </Base>
);
export const IconPhone = (p: P) => (
  <Base {...p}>
    <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
    <path d="M11 18.5h2" />
  </Base>
);
export const IconDownload = (p: P) => (
  <Base {...p}>
    <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14" />
  </Base>
);
export const IconLogout = (p: P) => (
  <Base {...p}>
    <path d="M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14" />
    <path d="M10 8 6 12l4 4M6 12h10" />
  </Base>
);
export const IconLock = (p: P) => (
  <Base {...p}>
    <rect x="5" y="10.5" width="14" height="10" rx="2" />
    <path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3" />
  </Base>
);
export const IconChat = (p: P) => (
  <Base {...p}>
    <path d="M4 19.5 5.3 16A8 8 0 1 1 8 18.7L4 19.5Z" />
  </Base>
);
export const IconSchool = (p: P) => (
  <Base {...p}>
    <path d="M3 9.5 12 5l9 4.5-9 4.5-9-4.5Z" />
    <path d="M7 11.5V16c1.5 1.5 3.3 2 5 2s3.5-.5 5-2v-4.5" />
  </Base>
);
export const IconSpinner = ({ className = "", ...p }: P) => (
  <svg viewBox="0 0 24 24" aria-hidden width={18} height={18} className={`animate-spin ${className}`} {...p}>
    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
    <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
);
