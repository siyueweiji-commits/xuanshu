import { HashRouter, NavLink, Route, Routes, useLocation } from "react-router-dom";
import Home from "./pages/Home";
import LiuRi from "./pages/LiuRi";
import ZiWei from "./pages/ZiWei";
import BaZi from "./pages/BaZi";
import MeiHua from "./pages/MeiHua";
import LiuYao from "./pages/LiuYao";
import LiFa from "./pages/LiFa";
import Report from "./pages/Report";
import Settings from "./pages/Settings";
import {
  IconCalendar,
  IconDoc,
  IconFlower,
  IconHexagram,
  IconHome,
  IconPillars,
  IconSliders,
  IconSparkle,
  IconSun
} from "./components/icons";

const NAV = [
  { to: "/", label: "首页", Icon: IconHome },
  { to: "/liuri", label: "流日黄历", Icon: IconSun },
  { to: "/lifa", label: "历法转换", Icon: IconCalendar },
  { to: "/ziwei", label: "紫微斗数", Icon: IconSparkle },
  { to: "/bazi", label: "八字", Icon: IconPillars },
  { to: "/meihua", label: "梅花易数", Icon: IconFlower },
  { to: "/liuyao", label: "六爻", Icon: IconHexagram },
  { to: "/report", label: "报告", Icon: IconDoc },
  { to: "/settings", label: "设置", Icon: IconSliders }
];

function Shell() {
  const { pathname } = useLocation();
  const current = NAV.find((n) => n.to === pathname);

  return (
    <div className="flex h-full overflow-hidden bg-canvas">
      {/* 侧边栏：顶部为窗口拖拽区 */}
      <aside className="flex w-[216px] shrink-0 flex-col border-r border-hair bg-sidebar">
        <div className="titlebar-drag flex h-[38px] shrink-0 items-center gap-2 px-4">
          <span className="grid h-[19px] w-[19px] place-items-center rounded-[5px] bg-accent text-[11px] font-bold leading-none text-white">
            玄
          </span>
          <span className="text-[13px] font-semibold tracking-tightest text-ink">玄枢</span>
          <span className="text-micro text-ink-4">XuanShu</span>
        </div>

        <nav className="flex min-h-0 flex-1 flex-col gap-px overflow-y-auto px-2 pb-2">
          {NAV.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) => `nav-item ${isActive ? "nav-item-active" : ""}`}
            >
              <Icon />
              <span className="truncate">{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="shrink-0 px-4 pb-3 pt-2 text-micro leading-relaxed text-ink-4">
          离线运行
          <br />
          数据仅存本机
        </div>
      </aside>

      {/* 主区：顶部标题条为拖拽区，右侧预留系统窗口控件 */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-white">
        <header className="titlebar-drag flex h-[38px] shrink-0 items-center border-b border-hair bg-white pl-5 pr-[148px]">
          <span className="text-[13px] font-medium text-ink-2">{current?.label ?? "玄枢"}</span>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1060px] px-8 pb-14 pt-7">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/liuri" element={<LiuRi />} />
              <Route path="/lifa" element={<LiFa />} />
              <Route path="/ziwei" element={<ZiWei />} />
              <Route path="/bazi" element={<BaZi />} />
              <Route path="/meihua" element={<MeiHua />} />
              <Route path="/liuyao" element={<LiuYao />} />
              <Route path="/report" element={<Report />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </div>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  );
}
