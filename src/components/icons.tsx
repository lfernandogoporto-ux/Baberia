import type { SVGProps } from 'react'

// Íconos propios: trazo 1.75, esquinas redondeadas, caja de 24.
type P = SVGProps<SVGSVGElement> & { size?: number }
const Svg = ({ size = 22, children, ...rest }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
    {children}
  </svg>
)

export const IconCalendar = (p: P) => (
  <Svg {...p}><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></Svg>
)
export const IconWallet = (p: P) => (
  <Svg {...p}><rect x="3" y="6" width="18" height="13.5" rx="2.5" /><path d="M3 10h18M15.5 14.75h2" /></Svg>
)
export const IconChart = (p: P) => (
  <Svg {...p}><path d="M4 20h16" /><path d="M7 16.5v-5M12 16.5V7M17 16.5v-8" /></Svg>
)
export const IconPeople = (p: P) => (
  <Svg {...p}><circle cx="9" cy="8.5" r="3.25" /><path d="M3.5 19.5c.6-3 2.8-4.75 5.5-4.75s4.9 1.75 5.5 4.75" /><path d="M15.5 5.6a3.25 3.25 0 0 1 0 5.8M17.5 14.9c1.6.6 2.7 2.2 3 4.6" /></Svg>
)
export const IconShop = (p: P) => (
  <Svg {...p}><path d="M4 9.5V20h16V9.5" /><path d="M3 9.5 5 4h14l2 5.5c0 1.5-1.2 2.5-2.6 2.5S16 11 16 9.5c0 1.5-1.4 2.5-2.7 2.5h-2.6C9.4 12 8 11 8 9.5 8 11 6.9 12 5.6 12S3 11 3 9.5Z" /><path d="M10 20v-4.5h4V20" /></Svg>
)
export const IconPlus = (p: P) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>
export const IconChevronRight = (p: P) => <Svg {...p}><path d="m9.5 6 6 6-6 6" /></Svg>
export const IconChevronLeft = (p: P) => <Svg {...p}><path d="m14.5 6-6 6 6 6" /></Svg>
export const IconCheck = (p: P) => <Svg {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></Svg>
export const IconX = (p: P) => <Svg {...p}><path d="M6 6l12 12M18 6 6 18" /></Svg>
export const IconAlert = (p: P) => (
  <Svg {...p}><path d="M12 4 2.8 19.5h18.4L12 4Z" /><path d="M12 10v4.25M12 17.1v.05" /></Svg>
)
export const IconInfo = (p: P) => (
  <Svg {...p}><circle cx="12" cy="12" r="8.75" /><path d="M12 11v5.25M12 7.9v.05" /></Svg>
)
export const IconClock = (p: P) => (
  <Svg {...p}><circle cx="12" cy="12" r="8.75" /><path d="M12 7.5V12l3 2" /></Svg>
)
export const IconScissors = (p: P) => (
  <Svg {...p}><circle cx="6.5" cy="7" r="2.75" /><circle cx="6.5" cy="17" r="2.75" /><path d="M8.7 8.6 20 17M8.7 15.4 20 7" /></Svg>
)
export const IconChat = (p: P) => (
  <Svg {...p}><path d="M4.5 19.5 5.6 16A7.75 7.75 0 1 1 8.4 18.6L4.5 19.5Z" /></Svg>
)
export const IconLogout = (p: P) => (
  <Svg {...p}><path d="M14 4.5h3.5a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H14" /><path d="M10 8l-4 4 4 4M6 12h9" /></Svg>
)
export const IconMenu = (p: P) => <Svg {...p}><path d="M4 7h16M4 12h16M4 17h16" /></Svg>
export const IconBox = (p: P) => (
  <Svg {...p}><path d="M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4v-9Z" /><path d="M3.5 7.5 12 11.5l8.5-4M12 11.5v9" /></Svg>
)
export const IconPin = (p: P) => (
  <Svg {...p}><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" /><circle cx="12" cy="10" r="2.25" /></Svg>
)
export const IconImage = (p: P) => (
  <Svg {...p}><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><circle cx="9" cy="9.5" r="1.75" /><path d="m4 17 5-4.5 4 3.5 2.5-2 4.5 3.5" /></Svg>
)
export const IconStar = ({ filled, ...p }: P & { filled?: boolean }) => (
  <Svg {...p} fill={filled ? 'currentColor' : 'none'}><path d="m12 3.75 2.5 5.1 5.6.8-4.05 3.95.95 5.6L12 16.55 6.95 19.2l.95-5.6L3.9 9.65l5.6-.8L12 3.75Z" /></Svg>
)
export const IconTv = (p: P) => (
  <Svg {...p}><rect x="3" y="5" width="18" height="12" rx="2" /><path d="M8.5 20.5h7M12 17v3.5" /></Svg>
)
export const IconQr = (p: P) => (
  <Svg {...p}><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><path d="M14 14h2.5v2.5H14zM17.5 17.5H20V20h-2.5zM14 20h1M20 14v1" /></Svg>
)
export const IconCamera = (p: P) => (
  <Svg {...p}><path d="M4 8.5A2 2 0 0 1 6 6.5h2l1.5-2h5l1.5 2h2a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8.5Z" /><circle cx="12" cy="13" r="3.5" /></Svg>
)
export const IconQueue = (p: P) => (
  <Svg {...p}><circle cx="6" cy="8" r="2.5" /><circle cx="12" cy="8" r="2.5" /><circle cx="18" cy="8" r="2.5" /><path d="M2.75 18c.4-2.6 1.6-4 3.25-4s2.85 1.4 3.25 4M8.75 18c.4-2.6 1.6-4 3.25-4s2.85 1.4 3.25 4M14.75 18c.4-2.6 1.6-4 3.25-4s2.85 1.4 3.25 4" /></Svg>
)
export const IconCash = (p: P) => (
  <Svg {...p}><rect x="2.5" y="6" width="19" height="12" rx="2" /><circle cx="12" cy="12" r="2.75" /><path d="M6 9.5v.01M18 14.5v.01" /></Svg>
)
export const IconBell = (p: P) => (
  <Svg {...p}><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15l1.5-2Z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></Svg>
)
export const IconUser = (p: P) => (
  <Svg {...p}><circle cx="12" cy="8.5" r="3.75" /><path d="M4.5 20c.8-3.6 3.7-5.5 7.5-5.5s6.7 1.9 7.5 5.5" /></Svg>
)
export const IconUpload = (p: P) => (
  <Svg {...p}><path d="M12 15V4.5M7.5 9 12 4.5 16.5 9" /><path d="M4.5 15v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3" /></Svg>
)
