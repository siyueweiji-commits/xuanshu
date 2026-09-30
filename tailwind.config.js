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
      /**
       * 颜色令牌全部走 CSS 变量（定义见 src/index.css 的 :root 与 .dark），
       * 于是深色模式只需切换 <html class="dark">，组件代码里不用写任何 dark: 变体。
       *
       * 约定：
       *   - 需要 `bg-x/10` 这类透明度修饰的令牌，用 `rgb(var(--x) / <alpha-value>)`，
       *     变量值必须是「R G B」三元组；
       *   - 不需要修饰的令牌（含自带透明度的 hair）直接用 `var(--x)`。
       */
      colors: {
        /** 窗口底色 */
        canvas: "var(--c-canvas)",
        /** 卡片 / 面板底色（原 bg-white） */
        surface: "var(--c-surface)",
        /** 侧边栏底色 */
        sidebar: "var(--c-sidebar)",
        gray1: "var(--c-gray1)",
        gray2: "var(--c-gray2)",
        gray3: "var(--c-gray3)",
        gray4: "var(--c-gray4)",
        gray5: "var(--c-gray5)",
        gray6: "var(--c-gray6)",
        /** 分割线 / 描边 */
        line: "var(--c-line)",
        hair: "var(--c-hair)",
        /** 中性叠加层（hover / chip 底），替代原来的 black/5 */
        hover: "rgb(var(--c-hover) / <alpha-value>)",
        /** 遮罩层（弹窗背景） */
        scrim: "rgb(var(--c-scrim) / <alpha-value>)",
        /** 文字层级 */
        ink: "var(--c-ink)",
        "ink-2": "var(--c-ink-2)",
        "ink-3": "var(--c-ink-3)",
        "ink-4": "var(--c-ink-4)",
        /** 强调色 */
        accent: {
          DEFAULT: "rgb(var(--c-accent) / <alpha-value>)",
          dark: "rgb(var(--c-accent-dark) / <alpha-value>)",
          light: "rgb(var(--c-accent-light) / <alpha-value>)"
        },
        purple: "rgb(var(--c-purple) / <alpha-value>)",
        danger: "rgb(var(--c-danger) / <alpha-value>)",
        warning: "rgb(var(--c-warning) / <alpha-value>)",
        success: "rgb(var(--c-success) / <alpha-value>)",
        /** 五行取色 */
        elm: {
          mu: "rgb(var(--c-elm-mu) / <alpha-value>)",
          huo: "rgb(var(--c-elm-huo) / <alpha-value>)",
          tu: "rgb(var(--c-elm-tu) / <alpha-value>)",
          jin: "rgb(var(--c-elm-jin) / <alpha-value>)",
          shui: "rgb(var(--c-elm-shui) / <alpha-value>)"
        },
        /** 五行之外，卦象 / 分类用的少量固定色 */
        mark: {
          warn: "rgb(var(--c-mark-warn) / <alpha-value>)",
          danger: "rgb(var(--c-mark-danger) / <alpha-value>)",
          success: "rgb(var(--c-mark-success) / <alpha-value>)",
          info: "rgb(var(--c-mark-info) / <alpha-value>)",
          purple: "rgb(var(--c-mark-purple) / <alpha-value>)"
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
        card: "var(--sh-card)",
        pop: "var(--sh-pop)",
        seg: "var(--sh-seg)",
        btn: "var(--sh-btn)"
      },
      letterSpacing: {
        tightest: "-0.022em"
      }
    }
  },
  plugins: []
};
