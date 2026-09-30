/**
 * 极简 Mustache 子集模板引擎（零依赖）
 *
 * 支持三种标记：
 *   {{key}}              —— 变量插值，取不到值渲染为「—」
 *   {{#key}} … {{/key}}  —— 区块：key 为数组则逐项渲染（项内用 {{.}} 取当前项、
 *                          {{字段}} 取字段）；为真值对象渲染一次；为空/假则整块略去
 *   {{^key}} … {{/key}}  —— 反向区块：key 为空/假时渲染一次
 *
 * 另做「独占一行的标签」自动去掉缩进与换行（Mustache 的 standalone 规则），
 * 这样区块写在独立行上不会在多轮重复时留下空行。
 */

type Node =
  | { t: "text"; v: string }
  | { t: "var"; key: string }
  | { t: "block"; key: string; inverted: boolean; body: Node[] };

const TAG_RE = /\{\{([#^/]?)\s*([^}]*?)\s*\}\}/g;

/** 去掉独占一行标签的缩进与行尾换行 */
function stripStandalone(src: string): string {
  return src.replace(/^[ \t]*(\{\{[#^/][^}]*\}\})[ \t]*\r?\n/gm, "$1");
}

function parse(src: string): Node[] {
  const root: Node[] = [];
  const stack: Array<{ key: string; inverted: boolean; body: Node[] }> = [];
  const current = (): Node[] => (stack.length ? stack[stack.length - 1].body : root);

  let last = 0;
  TAG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TAG_RE.exec(src)) !== null) {
    const [full, sigil, name] = m;
    if (m.index > last) current().push({ t: "text", v: src.slice(last, m.index) });
    last = m.index + full.length;

    if (sigil === "#" || sigil === "^") {
      stack.push({ key: name, inverted: sigil === "^", body: [] });
    } else if (sigil === "/") {
      const top = stack.pop();
      if (!top) throw new Error(`模板闭合标签不匹配：{{/${name}}}（没有对应的开始标签）`);
      current().push({ t: "block", key: top.key, inverted: top.inverted, body: top.body });
    } else {
      current().push({ t: "var", key: name });
    }
  }
  if (stack.length) {
    throw new Error(`模板存在未闭合的区块：{{#${stack[stack.length - 1].key}}}`);
  }
  if (last < src.length) root.push({ t: "text", v: src.slice(last) });
  return root;
}

type Context = unknown[];

function lookup(ctx: Context, key: string): unknown {
  if (key === "." || key === "this") return ctx[ctx.length - 1];
  for (let i = ctx.length - 1; i >= 0; i -= 1) {
    const layer = ctx[i];
    if (layer && typeof layer === "object" && key in (layer as Record<string, unknown>)) {
      return (layer as Record<string, unknown>)[key];
    }
  }
  return undefined;
}

function isFalsy(v: unknown): boolean {
  if (v === null || v === undefined || v === false) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

/** 变量渲染：数组按「、」连接，对象转 JSON，空值统一为「—」 */
export function stringify(v: unknown): string {
  if (v === null || v === undefined || v === false) return "—";
  if (typeof v === "string") return v.trim() === "" ? "—" : v;
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "—";
  if (Array.isArray(v)) return v.length ? v.map(stringify).join("、") : "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function renderNodes(nodes: Node[], ctx: Context): string {
  let out = "";
  for (const n of nodes) {
    if (n.t === "text") {
      out += n.v;
    } else if (n.t === "var") {
      out += stringify(lookup(ctx, n.key));
    } else {
      const v = lookup(ctx, n.key);
      const empty = isFalsy(v);
      if (n.inverted) {
        if (empty) out += renderNodes(n.body, ctx);
        continue;
      }
      if (empty) continue;
      if (Array.isArray(v)) {
        for (const item of v) out += renderNodes(n.body, ctx.concat([item]));
      } else if (typeof v === "object") {
        out += renderNodes(n.body, ctx.concat([v]));
      } else {
        // 标量区块（如 {{#flag}}…{{/flag}}）：直接把标量压栈，{{.}} 取到它本身
        out += renderNodes(n.body, ctx.concat([v]));
      }
    }
  }
  return out;
}

export interface RenderOptions {
  /** 是否压缩连续空行（默认 true） */
  collapseBlankLines?: boolean;
}

/** 渲染模板 */
export function renderTemplate(
  source: string,
  vars: Record<string, unknown>,
  options: RenderOptions = {}
): string {
  const src = stripStandalone(source.replace(/\r\n/g, "\n"));
  const out = renderNodes(parse(src), [vars]);
  const collapse = options.collapseBlankLines !== false;
  const text = collapse ? out.replace(/\n{3,}/g, "\n\n") : out;
  // 去掉每行行尾空白，并统一为「非空内容结尾恰好一个换行」
  const trimmed = text.replace(/[ \t]+$/gm, "").trimEnd();
  return trimmed ? `${trimmed}\n` : "";
}

/** 列出模板里出现的变量名（校验模板与数据是否对齐用） */
export function collectTemplateVars(source: string): string[] {
  const names = new Set<string>();
  TAG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TAG_RE.exec(source.replace(/\r\n/g, "\n"))) !== null) {
    const name = m[2];
    if (name && name !== "." && name !== "this") names.add(name);
  }
  return [...names].sort();
}
