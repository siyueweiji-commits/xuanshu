import { ipcMain } from "electron";
import { getDb } from "../db/database";
import { calcZiwei, ZiweiRequest } from "../services/ziwei";
import { calcBazi, BaziRequest } from "../services/bazi";
import { shijianQigua, shuziQigua } from "../services/meihua";
import { qigua } from "../services/liuyao";
import { getHuangli } from "../services/huangli";
import { listRules, matchRules, saveUserRule, appDataSummary, DISCLAIMER, Rule } from "../services/rules";

type Handler = (payload: unknown) => unknown;

function handle(channel: string, fn: Handler): void {
  ipcMain.handle(channel, (_event, payload: unknown) => {
    try {
      return { ok: true, data: fn(payload) };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
}

function asObject(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
}

function num(o: Record<string, unknown>, key: string, fallback = 0): number {
  const v = o[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function str(o: Record<string, unknown>, key: string, fallback = ""): string {
  const v = o[key];
  return typeof v === "string" ? v : fallback;
}

export function registerIpcHandlers(): void {
  // 应用信息
  handle("app:info", () => appDataSummary());

  // 档案管理
  handle("profile:create", (payload) => {
    const o = asObject(payload);
    const db = getDb();
    const stmt = db.prepare(
      "INSERT INTO profiles (name, gender, birth_time, birth_location, is_default) VALUES (?, ?, ?, ?, ?)"
    );
    const info = stmt.run(
      str(o, "name", "未命名"),
      str(o, "gender") === "female" ? "female" : "male",
      str(o, "birth_time", new Date().toISOString()),
      str(o, "birth_location") || null,
      o.is_default ? 1 : 0
    );
    return { id: info.lastInsertRowid };
  });

  handle("profile:list", () => getDb().prepare("SELECT * FROM profiles ORDER BY id DESC").all());

  handle("profile:delete", (payload) => {
    const id = num(asObject(payload), "id");
    getDb().prepare("DELETE FROM profiles WHERE id = ?").run(id);
    return { deleted: id };
  });

  // 排盘
  handle("chart:ziwei", (payload) => {
    const o = asObject(payload);
    const req: ZiweiRequest = {
      gender: str(o, "gender", "男"),
      year: num(o, "year"),
      month: num(o, "month"),
      day: num(o, "day"),
      timeIndex: num(o, "timeIndex"),
      calendar: str(o, "calendar", "solar") === "lunar" ? "lunar" : "solar"
    };
    return calcZiwei(req);
  });

  handle("chart:bazi", (payload) => {
    const o = asObject(payload);
    const req: BaziRequest = {
      gender: str(o, "gender", "男"),
      year: num(o, "year"),
      month: num(o, "month"),
      day: num(o, "day"),
      hour: num(o, "hour"),
      minute: num(o, "minute")
    };
    return calcBazi(req);
  });

  // 起卦
  handle("divination:meihua", (payload) => {
    const o = asObject(payload);
    if (str(o, "mode") === "numbers") {
      return shuziQigua({ num1: num(o, "num1"), num2: num(o, "num2") });
    }
    return shijianQigua({
      yearZhiIndex: num(o, "yearZhiIndex", 1),
      lunarMonth: num(o, "lunarMonth", 1),
      lunarDay: num(o, "lunarDay", 1),
      hourIndex: num(o, "hourIndex", 1)
    });
  });

  handle("divination:liuyao", (payload) => qigua({ question: str(asObject(payload), "question") }));

  // 规则库
  handle("rules:list", (payload) => listRules(str(asObject(payload), "system") || undefined));

  handle("rules:save", (payload) => {
    saveUserRule(asObject(payload) as unknown as Rule);
    return { saved: true };
  });

  // 流日运势（M4 完善：规则引擎注意事项）
  handle("daily:fortune", (payload) => {
    const o = asObject(payload);
    const huangli = getHuangli({ year: num(o, "year"), month: num(o, "month"), day: num(o, "day") }) as Record<string, unknown>;
    const facts = {
      dayInGanZhi: huangli.dayInGanZhi,
      jieQi: huangli.jieQi
    };
    const advice = matchRules(listRules(), facts).map((r) => r.advice);
    return { huangli, advice, disclaimer: DISCLAIMER };
  });
}
