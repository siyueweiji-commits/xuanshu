import type { ReactNode } from "react";

/**
 * 轻量线性图标集（SF Symbols 观感，16×16 网格，1.5pt 描边）。
 * 全部使用 currentColor，跟随主题与激活态。
 */

function Glyph({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`h-[17px] w-[17px] shrink-0 ${className ?? ""}`}
    >
      {children}
    </svg>
  );
}

export function IconHome({ className }: { className?: string }) {
  return (
    <Glyph className={className}>
      <path d="M2.5 6.6 8 2.3l5.5 4.3v6.2a.9.9 0 0 1-.9.9h-3.1V9.9H6.5v3.8H3.4a.9.9 0 0 1-.9-.9z" />
    </Glyph>
  );
}

export function IconCalendar({ className }: { className?: string }) {
  return (
    <Glyph className={className}>
      <rect x="2.3" y="3.6" width="11.4" height="10.1" rx="2.2" />
      <path d="M2.3 6.7h11.4M5.6 2.4v2.4M10.4 2.4v2.4" />
    </Glyph>
  );
}

export function IconSparkle({ className }: { className?: string }) {
  return (
    <Glyph className={className}>
      <path d="M8 2.2l1.45 4.35L13.8 8l-4.35 1.45L8 13.8l-1.45-4.35L2.2 8l4.35-1.45z" />
    </Glyph>
  );
}

/** 四柱：2×2 方格 */
export function IconPillars({ className }: { className?: string }) {
  return (
    <Glyph className={className}>
      <rect x="2.5" y="2.5" width="4.6" height="4.6" rx="1.3" />
      <rect x="8.9" y="2.5" width="4.6" height="4.6" rx="1.3" />
      <rect x="2.5" y="8.9" width="4.6" height="4.6" rx="1.3" />
      <rect x="8.9" y="8.9" width="4.6" height="4.6" rx="1.3" />
    </Glyph>
  );
}

/** 梅花：四瓣花 */
export function IconFlower({ className }: { className?: string }) {
  return (
    <Glyph className={className}>
      <path d="M8 2.2c1.55 1.5 1.55 4.1 0 5.6-1.55-1.5-1.55-4.1 0-5.6Z" />
      <path d="M13.8 8c-1.5 1.55-4.1 1.55-5.6 0 1.5-1.55 4.1-1.55 5.6 0Z" />
      <path d="M8 13.8c-1.55-1.5-1.55-4.1 0-5.6 1.55 1.5 1.55 4.1 0 5.6Z" />
      <path d="M2.2 8c1.5-1.55 4.1-1.55 5.6 0-1.5 1.55-4.1 1.55-5.6 0Z" />
    </Glyph>
  );
}

/** 六爻：三爻中爻断开 */
export function IconHexagram({ className }: { className?: string }) {
  return (
    <Glyph className={className}>
      <path d="M3 4.5h10M3 8h4.2M8.8 8H13M3 11.5h10" />
    </Glyph>
  );
}

/** 设置：滑杆 */
export function IconSliders({ className }: { className?: string }) {
  return (
    <Glyph className={className}>
      <path d="M2.6 5.5h2.4M8.55 5.5h4.85M2.6 10.5h6.75M12.85 10.5h.55" />
      <circle cx="6.8" cy="5.5" r="1.75" />
      <circle cx="11.1" cy="10.5" r="1.75" />
    </Glyph>
  );
}

export function IconDownload({ className }: { className?: string }) {
  return (
    <Glyph className={className}>
      <path d="M8 2.4v7.6M4.9 7.2 8 10.3l3.1-3.1M3 12.6h10" />
    </Glyph>
  );
}

/** 流日：日出地平线 */
export function IconSun({ className }: { className?: string }) {
  return (
    <Glyph className={className}>
      <circle cx="8" cy="8.6" r="3.1" />
      <path d="M8 2.2v1.3M8 13.7v.1M13.4 8.6h-1.3M3.9 8.6H2.6M11.8 4.8l-.9.9M5.1 12.3l-.9.9M11.8 12.3l-.9-.9M5.1 4.8l-.9-.9" />
      <path d="M2.6 14h10.8" />
    </Glyph>
  );
}

export function IconChevron({ className }: { className?: string }) {
  return (
    <Glyph className={className}>
      <path d="M6 3.8 10.2 8 6 12.2" />
    </Glyph>
  );
}

export function IconPin({ className }: { className?: string }) {
  return (
    <Glyph className={className}>
      <path d="M8 14s4.6-3.9 4.6-7.3A4.6 4.6 0 0 0 8 2.1a4.6 4.6 0 0 0-4.6 4.6C3.4 10.1 8 14 8 14Z" />
      <circle cx="8" cy="6.7" r="1.7" />
    </Glyph>
  );
}

/** 报告：带折角的文稿 */
export function IconDoc({ className }: { className?: string }) {
  return (
    <Glyph className={className}>
      <path d="M9.2 2.3H4.6a1.3 1.3 0 0 0-1.3 1.3v8.8a1.3 1.3 0 0 0 1.3 1.3h6.8a1.3 1.3 0 0 0 1.3-1.3V5.6z" />
      <path d="M9.2 2.3v3.3h3.5M5.9 8.8h4.2M5.9 11.2h3" />
    </Glyph>
  );
}
