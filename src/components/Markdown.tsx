import type { ReactNode } from "react";

/**
 * 极简 Markdown 渲染（仅覆盖报告模板用到的语法）：
 *   `#` / `##` / `###` 标题、`- ` 列表、`| a | b |` 表格、`**粗体**`、普通段落。
 * 不引入任何第三方解析库；无法识别的行按普通段落输出。
 */

type Block =
  | { t: "h"; level: number; text: string }
  | { t: "p"; lines: string[] }
  | { t: "ul"; items: string[] }
  | { t: "quote"; lines: string[] }
  | { t: "hr" }
  | { t: "table"; head: string[]; rows: string[][] };

function splitRow(line: string): string[] {
  const body = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return body.split("|").map((c) => c.trim());
}

function isRuleRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c.replace(/\s/g, "")));
}

function parse(src: string): Block[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i += 1;
      continue;
    }

    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      blocks.push({ t: "h", level: h[1].length, text: h[2].trim() });
      i += 1;
      continue;
    }

    // 分隔线（--- / *** / ___）
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      blocks.push({ t: "hr" });
      i += 1;
      continue;
    }

    // 引用块（> 开头，连续行合并）
    if (/^\s*>\s?/.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quoted.push(lines[i].replace(/^\s*>\s?/, "").trim());
        i += 1;
      }
      blocks.push({ t: "quote", lines: quoted });
      continue;
    }

    if (line.trim().startsWith("|")) {
      const head = splitRow(line);
      const rows: string[][] = [];
      i += 1;
      if (i < lines.length && isRuleRow(splitRow(lines[i]))) i += 1;
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      blocks.push({ t: "table", head, rows });
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, "").trim());
        i += 1;
      }
      blocks.push({ t: "ul", items });
      continue;
    }

    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,4})\s+/.test(lines[i]) &&
      !/^\s*([-*_])\1{2,}\s*$/.test(lines[i]) &&
      !/^\s*>\s?/.test(lines[i]) &&
      !lines[i].trim().startsWith("|") &&
      !/^\s*[-*]\s+/.test(lines[i])
    ) {
      para.push(lines[i].trim());
      i += 1;
    }
    if (para.length) blocks.push({ t: "p", lines: para });
  }

  return blocks;
}

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((seg, idx) => {
    if (seg.startsWith("**") && seg.endsWith("**") && seg.length > 4) {
      return (
        <strong key={idx} className="font-semibold text-ink">
          {seg.slice(2, -2)}
        </strong>
      );
    }
    if (seg.startsWith("`") && seg.endsWith("`") && seg.length > 2) {
      return (
        <code key={idx} className="num rounded bg-gray3 px-1 py-px text-[12px]">
          {seg.slice(1, -1)}
        </code>
      );
    }
    return <span key={idx}>{seg}</span>;
  });
}

const H_CLS: Record<number, string> = {
  1: "text-[19px] font-semibold tracking-tightest text-ink",
  2: "text-[15px] font-semibold tracking-tightest text-ink",
  3: "text-[13px] font-semibold text-ink",
  4: "text-[12px] font-semibold text-ink-2"
};

export default function Markdown({ source, className }: { source: string; className?: string }) {
  const blocks = parse(source);
  return (
    <div className={`space-y-3 ${className ?? ""}`}>
      {blocks.map((b, idx) => {
        if (b.t === "h") {
          const Tag = (`h${Math.min(4, Math.max(1, b.level))}` as unknown) as "h3";
          return (
            <Tag key={idx} className={`${H_CLS[b.level] ?? H_CLS[3]} ${idx === 0 ? "" : "pt-1"}`}>
              {inline(b.text)}
            </Tag>
          );
        }
        if (b.t === "hr") {
          return <hr key={idx} className="border-0 border-t border-line" />;
        }
        if (b.t === "quote") {
          return (
            <blockquote key={idx} className="notice notice-quiet">
              {b.lines.map((ln, k) => (
                <span key={k}>
                  {k > 0 && <br />}
                  {inline(ln)}
                </span>
              ))}
            </blockquote>
          );
        }
        if (b.t === "ul") {
          return (
            <ul key={idx} className="space-y-1.5">
              {b.items.map((it, k) => (
                <li key={k} className="flex gap-2 text-[13px] leading-relaxed text-ink-2">
                  <span className="mt-[7px] h-[3px] w-[3px] shrink-0 rounded-full bg-ink-4" />
                  <span className="min-w-0">{inline(it)}</span>
                </li>
              ))}
            </ul>
          );
        }
        if (b.t === "table") {
          return (
            <div key={idx} className="overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr>
                    {b.head.map((c, k) => (
                      <th
                        key={k}
                        className="border-b border-line px-2.5 py-1.5 text-left font-medium text-ink-3"
                      >
                        {inline(c)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {b.rows.map((r, k) => (
                    <tr key={k} className="border-b border-hair last:border-0">
                      {r.map((c, j) => (
                        <td key={j} className="px-2.5 py-1.5 align-top text-ink-2">
                          {inline(c)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        return (
          <p key={idx} className="text-[13px] leading-relaxed text-ink-2">
            {b.lines.map((ln, k) => (
              <span key={k}>
                {k > 0 && <br />}
                {inline(ln)}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
