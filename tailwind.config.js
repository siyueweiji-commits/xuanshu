/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "SF Pro Text",
          "Segoe UI Variable Text",
          "Segoe UI",
          "PingFang SC",
          "Microsoft YaHei UI",
          "Microsoft YaHei",
          "system-ui",
          "sans-serif"
        ],
        mono: ["SF Mono", "Cascadia Mono", "Consolas", "ui-monospace", "monospace"]
      },
      fontSize: {
        micro: ["11px", { lineHeight: "16px" }]
      },
      colors: {
        /** 窗口底色（Apple 浅色系统背景） */
        canvas: "#f5f5f7",
        /** 侧边栏底色 */
        sidebar: "#ececef",
        /** 中性灰阶 */
        gray1: "#fafafc",
        gray2: "#f5f5f7",
        gray3: "#efeff2",
        gray4: "#e3e3e8",
        gray5: "#d8d8dd",
        gray6: "#f0f0f3",
        /** 分割线 / 描边：极轻，Apple 风格 */
        line: "#d9d9de",
        hair: "rgba(0, 0, 0, 0.07)",
        /** 文字层级 */
        ink: "rgba(0, 0, 0, 0.86)",
        "ink-2": "rgba(60, 60, 67, 0.62)",
        "ink-3": "rgba(60, 60, 67, 0.42)",
        "ink-4": "rgba(60, 60, 67, 0.26)",
        /** 强调色：Apple 系统蓝 */
        accent: {
          DEFAULT: "#007aff",
          dark: "#0069dc",
          light: "#4aa3ff"
        },
        danger: "#ff3b30",
        warning: "#ff9500",
        success: "#34c759",
        /** 五行取色 */
        elm: {
          mu: "#2fae52",
          huo: "#ff453a",
          tu: "#c79a2e",
          jin: "#8e8e93",
          shui: "#0a84ff"
        }
      },
      borderRadius: {
        DEFAULT: "10px",
        sm: "7px",
        md: "12px",
        lg: "14px",
        xl: "18px",
        "2xl": "20px",
        "3xl": "26px"
      },
      boxShadow: {
        card: "0 1px 2px rgba(0, 0, 0, 0.04), 0 1px 6px rgba(0, 0, 0, 0.025)",
        pop: "0 10px 32px rgba(0, 0, 0, 0.10), 0 2px 6px rgba(0, 0, 0, 0.05)",
        seg: "0 1px 2px rgba(0, 0, 0, 0.10), 0 0 0 0.5px rgba(0, 0, 0, 0.04)",
        btn: "0 1px 2px rgba(0, 122, 255, 0.26)"
      },
      letterSpacing: {
        tightest: "-0.022em"
      }
    }
  },
  plugins: []
};
