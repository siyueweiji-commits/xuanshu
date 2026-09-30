import { astro } from "iztro";

export interface ZiweiRequest {
  gender: string; // "男" | "女"
  year: number;
  month: number;
  day: number;
  timeIndex: number; // 0=早子时 ... 12=晚子时
  minute?: number;
  calendar?: "solar" | "lunar";
}

/** 紫微斗数排盘（基于 iztro），M2 将补充大限/流年/流日/斗君 */
export function calcZiwei(req: ZiweiRequest): unknown {
  const dateStr = `${req.year}-${req.month}-${req.day}`;
  const gender = req.gender === "女" ? "女" : "男";
  if (req.calendar === "lunar") {
    // 参数序：农历日期、时辰序、性别、是否闰月、是否修正闰月、语言
    return astro.byLunar(dateStr, req.timeIndex, gender, false, true, "zh-CN");
  }
  return astro.bySolar(dateStr, req.timeIndex, gender, true, "zh-CN");
}
