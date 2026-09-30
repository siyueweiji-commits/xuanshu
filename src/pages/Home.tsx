import { useEffect, useState } from "react";
import { ipc } from "../lib/ipc";

interface Profile {
  id: number;
  name: string;
  gender: string;
  birth_time: string;
  birth_location: string | null;
  is_default: number;
}

export default function Home() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [name, setName] = useState("");
  const [gender, setGender] = useState("male");
  const [birthTime, setBirthTime] = useState("");
  const [error, setError] = useState("");

  async function refresh() {
    try {
      setProfiles(await ipc<Profile[]>("profile:list"));
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function createProfile() {
    setError("");
    if (!name.trim() || !birthTime) {
      setError("请填写姓名与出生时间");
      return;
    }
    try {
      await ipc("profile:create", { name: name.trim(), gender, birth_time: birthTime });
      setName("");
      setBirthTime("");
      await refresh();
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">欢迎使用玄枢</h2>
        <p className="mt-2 text-sm text-neutral-500">
          开箱即用的离线命理应用：紫微斗数 · 八字 · 梅花易数 · 六爻 · 流日黄历。
          所有数据仅保存在本地，不上传云端。
        </p>
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-700">
          ⚠️ 免责声明：本应用为文化娱乐工具，不构成任何医疗、法律、投资或驾驶安全建议，
          不承诺任何预测准确性。
        </div>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-base font-semibold">新建档案</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <input
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm sm:col-span-1"
            placeholder="姓名"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <select
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            value={gender}
            onChange={(e) => setGender(e.target.value)}
          >
            <option value="male">男</option>
            <option value="female">女</option>
          </select>
          <input
            type="datetime-local"
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm sm:col-span-2"
            value={birthTime}
            onChange={(e) => setBirthTime(e.target.value)}
          />
        </div>
        {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
        <button
          className="mt-4 rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700"
          onClick={() => void createProfile()}
        >
          保存档案
        </button>

        <h3 className="mb-2 mt-8 text-base font-semibold">档案列表</h3>
        {profiles.length === 0 ? (
          <p className="text-sm text-neutral-400">暂无档案</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {profiles.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                <span>
                  {p.name} · {p.gender === "female" ? "女" : "男"} · {p.birth_time}
                </span>
                <button
                  className="text-xs text-neutral-400 hover:text-red-500"
                  onClick={() => void ipc("profile:delete", { id: p.id }).then(refresh)}
                >
                  删除
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
