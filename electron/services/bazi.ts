import { Solar } from "lunar-typescript";

export interface BaziRequest {
  gender: string; // "男" | "女"
  year: number;
  month: number;
  day: number;
  hour: number; // 0-23
  minute?: number;
}

export interface Pillar {
  ganzhi: string;
  gan: string;
  zhi: string;
}

function pillar(ganzhi: string): Pillar {
  return { ganzhi, gan: ganzhi.charAt(0), zhi: ganzhi.charAt(1) };
}

/** 八字排盘（基于 lunar-typescript），M3 将补充十神/五行强弱/神煞/大运细节 */
export function calcBazi(req: BaziRequest): unknown {
  const solar = Solar.fromYmdHms(req.year, req.month, req.day, req.hour, req.minute ?? 0, 0);
  const lunar = solar.getLunar();
  const ec = lunar.getEightChar();

  return {
    solar: solar.toString(),
    lunar: lunar.toString(),
    yearInGanZhi: lunar.getYearInGanZhi(),
    yearShengXiao: lunar.getYearShengXiao(),
    jieQiTable: Object.fromEntries(
      Object.entries(lunar.getJieQiTable()).map(([name, solar]) => [name, solar.toString()])
    ),
    fourPillars: {
      year: pillar(ec.getYear()),
      month: pillar(ec.getMonth()),
      day: pillar(ec.getDay()),
      time: pillar(ec.getTime())
    },
    dayMaster: ec.getDayGan(),
    disclaimer:
      "本结果仅供文化娱乐与自省参考，不构成任何专业建议。"
  };
}
