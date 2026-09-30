/**
 * 命盘图片导出（纯 Canvas 2D 绘制，零第三方依赖）
 *
 * 选择「自绘」而非窗口截图的理由：
 *   - 不受窗口尺寸与滚动位置限制，内容多长都能完整出图
 *   - 可指定缩放倍数输出高清图（默认 2x → 2000×2000）
 *   - 与页面样式解耦，导出结果稳定、可预期
 *
 * 布局采用传统紫微命盘的「寅在左下、顺时针」十二宫排布。
 */

/** 十二宫在 4×4 宫格中的位置：[行, 列] */
const BRANCH_POS: Record<string, [number, number]> = {
  巳: [0, 0], 午: [0, 1], 未: [0, 2], 申: [0, 3],
  辰: [1, 0], 酉: [1, 3],
  卯: [2, 0], 戌: [2, 3],
  寅: [3, 0], 丑: [3, 1], 子: [3, 2], 亥: [3, 3]
};

const FONT = '"Microsoft YaHei", "微软雅黑", "PingFang SC", sans-serif';

export interface StarLike {
  name: string;
  brightness?: string;
  mutagen?: string;
}

export interface PalaceLike {
  name: string;
  heavenlyStem: string;
  earthlyBranch: string;
  isBodyPalace?: boolean;
  majorStars?: StarLike[];
  minorStars?: StarLike[];
}

export interface BirthMeta {
  applied?: boolean;
  clockTime?: string | null;
  trueSolarTime?: string | null;
  offsetMinutes?: number | null;
  cityName?: string | null;
}

export interface ChartLike {
  solarDate: string;
  lunarDate: string;
  chineseDate: string;
  soul: string;
  body: string;
  fiveElementsClass: string;
  palaces: PalaceLike[];
  meta?: { birth?: BirthMeta };
}

const CELL = 240;
const PAD = 20;
const SIZE = CELL * 4 + PAD * 2; // 1040×1040 逻辑坐标

/** 按最大宽度折行绘制文本，返回绘制后的 y 坐标 */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 4
): number {
  let line = "";
  let cy = y;
  let lines = 0;
  for (const ch of text) {
    const test = line + ch;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cy);
      line = ch;
      cy += lineHeight;
      lines += 1;
      if (lines >= maxLines) return cy;
    } else {
      line = test;
    }
  }
  if (line) {
    ctx.fillText(line, x, cy);
    cy += lineHeight;
  }
  return cy;
}

function drawPalace(
  ctx: CanvasRenderingContext2D,
  p: PalaceLike,
  x: number,
  y: number
): void {
  ctx.fillStyle = p.isBodyPalace ? "#fffbeb" : "#ffffff";
  ctx.fillRect(x, y, CELL, CELL);
  ctx.strokeStyle = p.isBodyPalace ? "#fbbf24" : "#d4d4d4";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);

  const pad = 10;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  // 宫名（身宫加标记）
  ctx.fillStyle = "#404040";
  ctx.font = `600 15px ${FONT}`;
  ctx.fillText(`${p.name}宫`, x + pad, y + pad);
  if (p.isBodyPalace) {
    const w = ctx.measureText(`${p.name}宫`).width;
    ctx.fillStyle = "#b45309";
    ctx.font = `12px ${FONT}`;
    ctx.fillText("身", x + pad + w + 4, y + pad + 2);
  }

  // 宫位干支（右上角）
  ctx.fillStyle = "#a3a3a3";
  ctx.font = `13px ${FONT}`;
  ctx.textAlign = "right";
  ctx.fillText(`${p.heavenlyStem}${p.earthlyBranch}`, x + CELL - pad, y + pad + 1);
  ctx.textAlign = "left";

  // 主星
  let cy = y + pad + 28;
  for (const s of p.majorStars ?? []) {
    ctx.font = `600 19px ${FONT}`;
    ctx.fillStyle = "#171717";
    ctx.fillText(s.name, x + pad, cy);
    let cx = x + pad + ctx.measureText(s.name).width + 5;

    if (s.brightness) {
      ctx.font = `12px ${FONT}`;
      ctx.fillStyle = "#a3a3a3";
      ctx.fillText(s.brightness, cx, cy + 6);
      cx += ctx.measureText(s.brightness).width + 5;
    }
    if (s.mutagen) {
      ctx.font = `12px ${FONT}`;
      ctx.fillStyle = "#dc2626";
      ctx.fillText(`[${s.mutagen}]`, cx, cy + 6);
    }
    cy += 26;
  }

  // 辅星 / 杂曜
  const minors = (p.minorStars ?? []).map((s) => s.name);
  if (minors.length > 0) {
    ctx.fillStyle = "#737373";
    ctx.font = `13px ${FONT}`;
    wrapText(ctx, minors.join(" "), x + pad, cy + 4, CELL - pad * 2, 17, 5);
  }
}

function drawCenter(ctx: CanvasRenderingContext2D, chart: ChartLike, x: number, y: number): void {
  const w = CELL * 2;
  const h = CELL * 2;
  ctx.fillStyle = "#fafafa";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "#d4d4d4";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

  const cx = x + w / 2;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  let cy = y + 46;
  ctx.fillStyle = "#171717";
  ctx.font = `700 24px ${FONT}`;
  ctx.fillText("玄枢 · 紫微斗数命盘", cx, cy);

  cy += 48;
  ctx.font = `14px ${FONT}`;
  ctx.fillStyle = "#525252";
  ctx.fillText(`公历　${chart.solarDate}`, cx, cy);
  cy += 24;
  ctx.fillText(`农历　${chart.lunarDate}`, cx, cy);
  cy += 24;
  ctx.fillText(`干支　${chart.chineseDate}`, cx, cy);

  cy += 34;
  ctx.font = `15px ${FONT}`;
  ctx.fillStyle = "#171717";
  ctx.fillText(`命主 ${chart.soul}　　身主 ${chart.body}`, cx, cy);
  cy += 26;
  ctx.fillText(`五行局　${chart.fiveElementsClass}`, cx, cy);

  // 真太阳时校正备注
  const birth = chart.meta?.birth;
  if (birth?.applied && birth.trueSolarTime) {
    cy += 30;
    ctx.font = `12px ${FONT}`;
    ctx.fillStyle = "#b45309";
    const city = birth.cityName ? `${birth.cityName} ` : "";
    ctx.fillText(
      `${city}真太阳时 ${birth.clockTime} → ${birth.trueSolarTime}`,
      cx,
      cy
    );
    cy += 18;
    ctx.fillStyle = "#a16207";
    ctx.fillText(`（校正 ${birth.offsetMinutes ?? 0} 分钟）`, cx, cy);
  }

  // 免责声明
  ctx.font = `11px ${FONT}`;
  ctx.fillStyle = "#a3a3a3";
  ctx.fillText("仅供文化娱乐与自省参考，不构成任何专业建议", cx, y + h - 34);
}

/**
 * 绘制命盘为 canvas。
 * @param scale 输出缩放倍数，2 表示 2080×2080 高清图
 */
export function renderChartCanvas(chart: ChartLike, scale = 2): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE * scale;
  canvas.height = SIZE * scale;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法创建画布上下文（canvas 2d）");
  ctx.scale(scale, scale);

  // 背景
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, SIZE, SIZE);

  // 十二宫
  for (const p of chart.palaces) {
    const pos = BRANCH_POS[p.earthlyBranch];
    if (!pos) continue;
    drawPalace(ctx, p, PAD + pos[1] * CELL, PAD + pos[0] * CELL);
  }

  // 中央信息区
  drawCenter(ctx, chart, PAD + CELL, PAD + CELL);

  return canvas;
}

/** 生成 PNG dataURL */
export function chartToPngDataUrl(chart: ChartLike, scale = 2): string {
  return renderChartCanvas(chart, scale).toDataURL("image/png");
}
