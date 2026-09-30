import { HashRouter, Routes, Route, NavLink } from "react-router-dom";
import Home from "./pages/Home";
import ZiWei from "./pages/ZiWei";
import BaZi from "./pages/BaZi";
import MeiHua from "./pages/MeiHua";
import LiuYao from "./pages/LiuYao";
import LiFa from "./pages/LiFa";
import Settings from "./pages/Settings";

const NAV = [
  { to: "/", label: "首页", icon: "🏠" },
  { to: "/lifa", label: "历法转换", icon: "📅" },
  { to: "/ziwei", label: "紫微斗数", icon: "🌌" },
  { to: "/bazi", label: "八字", icon: "🎋" },
  { to: "/meihua", label: "梅花易数", icon: "☯" },
  { to: "/liuyao", label: "六爻", icon: "🪙" },
  { to: "/settings", label: "设置", icon: "⚙" }
];

export default function App() {
  return (
    <HashRouter>
      <div className="flex h-full">
        <aside className="w-52 shrink-0 border-r border-neutral-200 bg-white p-4">
          <h1 className="mb-6 text-xl font-bold tracking-wide">
            玄枢 <span className="text-sm font-normal text-neutral-400">XuanShu</span>
          </h1>
          <nav className="flex flex-col gap-1">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                    isActive ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"
                  }`
                }
              >
                <span>{item.icon}</span>
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>
        <main className="flex-1 overflow-y-auto p-8">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/lifa" element={<LiFa />} />
            <Route path="/ziwei" element={<ZiWei />} />
            <Route path="/bazi" element={<BaZi />} />
            <Route path="/meihua" element={<MeiHua />} />
            <Route path="/liuyao" element={<LiuYao />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
}
