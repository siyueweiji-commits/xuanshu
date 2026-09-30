import { useEffect, useState } from "react";
import { ipc } from "../lib/ipc";

interface AppInfo {
  appName: string;
  appVersion: string;
  platform: string;
  userDataDir: string;
  dataDir: string;
}

export default function Settings() {
  const [info, setInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    ipc<AppInfo>("app:info")
      .then(setInfo)
      .catch(() => setInfo(null));
  }, []);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">设置</h2>
        {info ? (
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-neutral-400">应用</dt><dd>{info.appName} v{info.appVersion}</dd></div>
            <div className="flex justify-between"><dt className="text-neutral-400">平台</dt><dd>{info.platform}</dd></div>
            <div className="flex justify-between"><dt className="text-neutral-400">数据目录</dt><dd className="max-w-xs truncate" title={info.dataDir}>{info.dataDir}</dd></div>
          </dl>
        ) : (
          <p className="text-sm text-neutral-400">无法获取应用信息（需在 Electron 窗口中运行）。</p>
        )}
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-sm text-sm leading-relaxed">
        <h3 className="mb-3 font-semibold">免责声明</h3>
        <p className="text-neutral-500">
          玄枢是一款文化娱乐工具，用于个人自省与命理学习研究。所有排盘、卦象、运势与注意事项输出均仅供娱乐参考，
          不构成任何医疗、法律、投资或驾驶安全建议，不承诺任何预测准确性。请理性看待，切勿据此做出重大决策。
        </p>
        <h3 className="mb-3 mt-6 font-semibold">隐私说明</h3>
        <p className="text-neutral-500">
          所有数据（档案、命盘、卦例、反馈）仅保存在本地数据目录，不上传任何云端服务器。
          您可随时在数据目录中查看、备份或删除全部数据。具备联网条件时，应用仅从 GitHub
          公开仓库拉取规则库与知识库更新，不会上传本地数据。
        </p>
      </section>
    </div>
  );
}
