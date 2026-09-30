import { contextBridge, ipcRenderer } from "electron";

// IPC 通道白名单：仅允许业务前缀，防止任意通道调用
const ALLOWED_CHANNELS = [
  /^app:/,
  /^profile:/,
  /^chart:/,
  /^divination:/,
  /^rules:/,
  /^daily:/
];

contextBridge.exposeInMainWorld("xuanshu", {
  invoke: (channel: string, payload?: unknown): Promise<unknown> => {
    if (!ALLOWED_CHANNELS.some((re) => re.test(channel))) {
      return Promise.reject(new Error(`IPC channel not allowed: ${channel}`));
    }
    return ipcRenderer.invoke(channel, payload);
  }
});
