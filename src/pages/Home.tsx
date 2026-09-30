import { useEffect, useState } from "react";
import { ipc } from "../lib/ipc";
import PageHead from "../components/PageHead";

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
    <div className="page">
      <PageHead
        title="欢迎使用玄枢"
        desc="开箱即用的离线命理应用 —— 紫微斗数 · 八字 · 梅花易数 · 六爻 · 流日黄历。所有数据仅保存在本机，不上传云端。"
      />

      <div className="notice notice-warn">
        ⚠️ 免责声明：本应用为文化娱乐工具，不构成任何医疗、法律、投资或驾驶安全建议，不承诺任何预测准确性。
      </div>

      <section className="card card-p">
        <h2 className="title">新建档案</h2>
        <p className="mt-1 sub">保存常用生辰，下次排盘可直接调用。</p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div>
            <label className="label">姓名</label>
            <input
              className="input"
              placeholder="如：叶新成"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="label">性别</label>
            <select className="select" value={gender} onChange={(e) => setGender(e.target.value)}>
              <option value="male">男</option>
              <option value="female">女</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label">出生时间</label>
            <input
              type="datetime-local"
              className="input"
              value={birthTime}
              onChange={(e) => setBirthTime(e.target.value)}
            />
          </div>
        </div>

        {error && <p className="notice notice-danger mt-3 break-all">{error}</p>}

        <button className="btn btn-primary mt-4" onClick={() => void createProfile()}>
          保存档案
        </button>
      </section>

      <section className="card card-p">
        <div className="flex items-center justify-between gap-3">
          <h2 className="title">档案列表</h2>
          <span className="chip chip-neutral">{profiles.length} 条</span>
        </div>

        {profiles.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-line px-4 py-9 text-center text-xs text-ink-4">
            暂无档案，填写上方表单即可创建
          </div>
        ) : (
          <ul className="mt-2 -mx-2">
            {profiles.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-4 rounded-lg px-2 py-2.5 transition-colors hover:bg-gray1"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-medium text-ink">{p.name}</span>
                    <span className="chip chip-neutral">{p.gender === "female" ? "女" : "男"}</span>
                  </div>
                  <div className="num mt-0.5 text-xs text-ink-3">{p.birth_time}</div>
                </div>
                <button
                  className="btn btn-sm btn-quiet hover:text-danger"
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
