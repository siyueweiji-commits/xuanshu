import type { ReactNode } from "react";

/** 页面标题区：统一的字号层级与留白，右侧可挂操作按钮 */
export default function PageHead({
  title,
  desc,
  right
}: {
  title: string;
  desc?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 pb-1">
      <div className="min-w-0">
        <h1 className="title-lg">{title}</h1>
        {desc && <p className="mt-1 max-w-2xl sub">{desc}</p>}
      </div>
      {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
    </div>
  );
}
