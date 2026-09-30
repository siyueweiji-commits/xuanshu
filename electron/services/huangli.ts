/**
 * 黄历 / 流日基础版（基于 lunar-typescript）
 * M4 将补充：冲煞、彭祖百忌、神煞、建除十二神、二十八宿、流日盘
 */
import { Solar } from "lunar-typescript";

export interface HuangliRequest {
  year: number;
  month: number;
  day: number;
}

export function getHuangli(req: HuangliRequest): unknown {
  const solar = Solar.fromYmd(req.year, req.month, req.day);
  const lunar = solar.getLunar();
  return {
    date: solar.toString(),
    lunarDate: lunar.toString(),
    yearInGanZhi: lunar.getYearInGanZhi(),
    monthInGanZhi: lunar.getMonthInGanZhi(),
    dayInGanZhi: lunar.getDayInGanZhi(),
    shengXiao: lunar.getYearShengXiao(),
    jieQi: lunar.getJieQi(),
    yi: lunar.getDayYi(),
    ji: lunar.getDayJi(),
    disclaimer: "黄历信息仅供文化参考，不构成任何专业建议。"
  };
}
