import { useEffect, useState } from "react";
import { ipc } from "../lib/ipc";
import PageHead from "../components/PageHead";

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
    <div className="page">
      <PageHead title="设置" desc="应用信息、数据位置与合规说明。" />

      <section className="card card-p">
        <h2 className="title">应用信息</h2>
        {info ? (
          <dl className="mt-4">
            <div className="kv">
              <dt className="kv-k">应用</dt>
              <dd className="kv-v">
                {info.appName} <span className="num text-ink-3">v{info.appVersion}</span>
              </dd>
            </div>
            <div className="kv">
              <dt className="kv-k">平台</dt>
              <dd className="kv-v">{info.platform}</dd>
            </div>
            <div className="kv">
              <dt className="kv-k">数据目录</dt>
              <dd className="kv-v num" title={info.dataDir}>
                {info.dataDir}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-3 sub">无法获取应用信息（需在 Electron 窗口中运行）。</p>
        )}
      </section>

      <section className="card card-p">
        <h2 className="title">免责声明</h2>
        <p className="mt-2 sub">
          玄枢是一款文化娱乐工具，用于个人自省与命理学习研究。所有排盘、卦象、运势与注意事项输出均仅供娱乐参考，不构成任何医疗、法律、投资或驾驶安全建议，不承诺任何预测准确性。请理性看待，切勿据此做出重大决策。
        </p>

        <h2 className="mt-6 title">隐私说明</h2>
        <p className="mt-2 sub">
          所有数据（档案、命盘、卦例、反馈）仅保存在本地数据目录，不上传任何云端服务器。您可随时在数据目录中查看、备份或删除全部数据。具备联网条件时，应用仅从 GitHub 公开仓库拉取规则库与知识库更新，不会上传本地数据。
        </p>
      </section>
    </div>
  );
}
