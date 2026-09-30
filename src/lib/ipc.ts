/** 渲染进程访问主进程的统一入口（经 preload 白名单） */
interface IpcEnvelope {
  ok: boolean;
  data?: unknown;
  error?: string;
}

export function ipc<T = unknown>(channel: string, payload?: unknown): Promise<T> {
  const bridge = (window as unknown as { xuanshu?: { invoke: (c: string, p?: unknown) => Promise<IpcEnvelope> } })
    .xuanshu;
  if (!bridge) {
    return Promise.reject(new Error("玄枢主进程未就绪（请在 Electron 窗口中运行）"));
  }
  return bridge.invoke(channel, payload).then((envelope) => {
    if (!envelope.ok) throw new Error(envelope.error ?? "未知错误");
    return envelope.data as T;
  });
}
