# 选调生学习系统 · 设计契约（DESIGN.md）

> **状态**：权威规范。代码由团队按本文件执行；本文件不改代码。
> **适用**：`public/index.html`、`public/teacher.html`、`public/student.html` + `public/css/theme.css`
> **模式**：落地页 = **Persuade**；教师端 / 学员端 = **Operate**（可扫描性、一致性、真实使用场景优先，品牌感只落在精确细节上）
> **风格方向**：暖色复古质感（用户锁定，不可推翻）

---

## 0. 方向说明

**一句话**：把「深墨金光的电竞感后台」换成「**旧书与木质书桌**」——暖调纸面承载阅读，深墨木色承载结构，克制的书卷绿与赭石做强调，砖红只用于错误。

具体含义，按四个维度钉死：

| 维度 | 定义 | 反面（不要做） |
|---|---|---|
| **材质** | 早期印刷纸/毛边纸：极低对比的纤维噪点（`feTurbulence` 或 3% 斜织纹）、纸面内阴影（`inset 0 1px 0` 高光 + `inset 0 -1px 0` 暗边）做出「纸的厚度」。**不用玻璃拟态、不用 backdrop-blur**（现站有 12 处 `backdrop-filter`，全部拆除，见 §7 问题 3）。 | 磨砂玻璃卡片、霓虹光晕、渐变玻璃高光条。 |
| **色调** | 单一暖色相族（hue 30–45）贯穿全部中性色：纸 `#EAE0CE`、卡 `#F2E9D9`、浮层 `#FBF4E6`、凹陷 `#E1D5C0`。**全站只有两个彩色**：书卷绿（`#2F6B4F`，主强调 + 正确）与赭金（`#C9A96E`，衬线标题下划线/装饰线/印章，绝不作为正文色）。错误色只有砖红 `#9E3B2A`。 | 冷灰/蓝灰混入暖灰；紫蓝渐变；多色徽章彩虹；纯黑 `#000`。 |
| **字体气质** | 衬线承载「旧书」：中文标题用 **Source Han Serif SC / Noto Serif SC / 宋体**，西文与数字用 **Georgia**（已装、零成本、有旧式数字）；正文与操作界面用 **PingFang SC / Microsoft YaHei**（系统栈，零加载）。标题衬线、正文黑体，是中文书刊的标准分工。 | 标题用衬线写整段正文（衬线只做标题，≥18px）；用 Inter/Roboto 当标题；用 Fraunces / Instrument Serif 这类 AI 默认展示衬线。 |
| **密度** | 落地页：稀（`VISUAL_DENSITY ≈ 3`）；教师/学员端：密但不挤（`≈ 5`），统一 4px 节奏，行高中文正文 1.75。**卡片只在层级真实存在时使用**，相邻同级信息用分隔线或留白分组。 | 每张卡都有 border + shadow + 白底三件套；嵌套卡片；无意义的圆角差异（现站有 10/12/13/14/15/16/18/20px 八种圆角）。 |

**动效基调**：`MOTION_INTENSITY ≈ 3`。一次有作者意识的出现，不是每张卡都播同一个 0.55s 上浮。反馈 ≤200ms，入场 160–240ms ease-out。**不要做的事**：hover 触发的无限浮动（现站 `.quote-card:hover` 的 `floatY 7s infinite` / `.opt:not(.sel)` 的入场动画 / 全站 `pulse`）全部删除。

**这个产品不是**：不是金融仪表盘（不要数据密集的刻度、网格线、迷你图），不是营销炫技站（不要视差、滚动劫持、光标跟随），不是「国潮」皮肤（不要祥云纹、卷轴、烫金描边、印章铺满）。

---

## 1. 设计令牌（`theme.css` `:root` 全量替换）

### 1.1 令牌代码

把 `theme.css` 的 `:root{...}` 整块（现第 9–93 行）替换为下面两块。**变量名全部保留**，只换值；新增变量都在注释里标了用途。

```css
:root{
  /* ===================== 色彩 · 纸面层（浅底，承载阅读与操作） ===================== */
  --bg-page:      #EAE0CE;   /* 页面纸底 */
  --bg-card:      #F2E9D9;   /* 卡片/题面纸 */
  --bg-elevated:  #FBF4E6;   /* 浮层/弹窗/输入框（最亮的一层纸） */
  --bg-inset:     #E1D5C0;   /* 凹陷：进度槽、代码块、表格头 */

  /* 纸面半透明表面（替代原 rgba(255,255,255,.0x)） */
  --surface:      rgba(36,28,20,.035);
  --surface-2:    #E4D8C2;   /* 实心而非半透明：保证 muted 文字达标 */
  --surface-3:    rgba(36,28,20,.09);

  /* ===================== 色彩 · 深墨木层（header / footer / 金句卡 / 深色块） ===== */
  --ink-0:        #1A1410;   /* 最深：footer、金句卡底 */
  --ink-1:        #221A14;   /* header、深色强调块 */
  --ink-2:        #2C2219;   /* 深面内的卡片/输入 */
  --ink-3:        #3B2E22;   /* 深面分隔线 */

  /* ===================== 色彩 · 文字层级 =====================
     括号内为实测 WCAG 对比度（背景：纸底 / 卡片 / 浮层 / 凹陷 / surface-2） */
  --ink:   #241C14;  /* 主文字 12.83 / 13.93 / 15.33 / 11.57 / 11.91 */
  --text:  #493D2E;  /* 正文   8.07 /  8.76 /  9.64 /  7.28 /  7.49 */
  --muted: #5F4F3B;  /* 次要   6.02 /  6.53 /  7.19 /  5.43 /  5.58 */
  --faint: #75634C;  /* 弱提示/占位 4.40(大字) / 4.78 / 5.26 / 3.97(大字) / 4.09(大字) */
  --on-ink:      #F6EEDF;  /* 深墨面上的主文字 15.82 / 14.86 / 13.49 (ink-0/1/2) */
  --on-ink-2:    #DCCDB4;  /* 深墨面上的正文   11.67 / 10.96 /  9.95 */
  --on-ink-muted:#B5A488;  /* 深墨面上的次要    7.50 /  7.04 /  6.39 */
  --on-accent:   #FBF4E6;  /* 实心强调块上的反白文字（见 §1.2 反白表） */

  /* ===================== 色彩 · 强调与语义 =====================
     · primary = 书卷绿：主强调 + 答题「正确」。二者同色是本产品的刻意决定：
       学习系统里「做得对」就应该和品牌同色。
     · accent  = 砖红：危险/错误/删除。三级降级见 --err-soft。
     · gold    = 赭金：只做装饰（衬线标题下划线、卷首线、深面上的强调文字），不做正文色。 */
  --primary:      #2F6B4F;  /* 作文字：卡片 5.22 / 纸底 4.81 ｜ 实心块上反白 5.75 */
  --primary-d:    #245741;  /* 按下态：卡片 6.93 / 纸底 6.38 ｜ 反白 7.63 */
  --primary-l:    rgba(47,107,79,.10);  /* 淡底。10% 是上限：再深则 ok 文字跌破 4.5:1 */
  --primary-ll:   rgba(47,107,79,.18);
  --primary-grad: linear-gradient(180deg,#357657,#245741);
  --primary-grad-soft: linear-gradient(180deg,rgba(47,107,79,.10),rgba(47,107,79,.04));

  --accent:       #9E3B2A;  /* 砖红：卡片 5.60 / 纸底 5.16 ｜ 反白 6.16 */
  --accent-l:     rgba(158,59,42,.10);
  --err-soft:     #C2604A;  /* 3:1 级：只用于错误边框、图标等非文字元素（对纸底 3.17 / 对卡片 3.44） */

  --ok:           #2F6B4F;  /* 正确 = 书卷绿（与 primary 同值，见上） */
  --ok-l:         rgba(47,107,79,.10);
  --warn:         #7A4A12;  /* 警告：卡片 6.19 / 纸底 5.70 ｜ 反白 6.81 */
  --warn-l:       rgba(122,74,18,.10);
  --err:          #9E3B2A;  /* 错误 = 砖红 */
  --err-l:        rgba(158,59,42,.10);

  /* 赭金装饰族 */
  --gold:         #C9A96E;  /* 纸面上的装饰线/印章底：对纸底 1.86:1，故仅限装饰 */
  --gold-d:       #A8863F;
  --gold-l:       #E0C58C;  /* 深墨面上的金色文字：对 ink-1 10.23:1 */
  --gold-bright:  #E8C078;  /* 深墨面上的亮金：对 ink-0 10.89:1 */
  --gold-grad:    linear-gradient(180deg,#E0C58C,#A8863F);
  --gold-grad-soft: linear-gradient(180deg,rgba(201,169,110,.22),rgba(201,169,110,.06));

  /* ===================== 描边 / 分隔 ===================== */
  --border:        #CDBC9F;  /* 纸面常规描边，对卡片 1.54:1（衬托性，非信息） */
  --border-strong: #B9A484;  /* 纸面强调描边，2.00:1 */
  --rule-ink:      #3B2E22;  /* 深墨面分隔线 */
  --hairline-primary: #C9A96E;      /* 纸面上的赭金细线（卷首线） */
  --hairline-gold:    #C9A96E;
  --hairline-ink:     rgba(246,238,223,.14); /* 深墨面上的细线 */

  /* ===================== 阴影：纸的厚度，不是投影 ===================== */
  --shadow-sm: 0 1px 2px rgba(74,56,36,.10), inset 0 1px 0 rgba(255,255,255,.55);
  --shadow:    0 2px 4px rgba(74,56,36,.10), 0 8px 20px -12px rgba(74,56,36,.22), inset 0 1px 0 rgba(255,255,255,.60);
  --shadow-lg: 0 4px 10px rgba(74,56,36,.12), 0 24px 48px -20px rgba(74,56,36,.28), inset 0 1px 0 rgba(255,255,255,.65);
  --shadow-ink: 0 2px 6px rgba(0,0,0,.35), inset 0 1px 0 rgba(246,238,223,.06);
  --shadow-glow: inset 0 -2px 0 var(--gold);   /* 替代原金色外发光 */

  /* ===================== 字体 =====================
     中文优先；西文/数字回退到 Georgia 与系统栈。全部系统字体，零网络请求。
     若后续允许自托管，首选：标题 「Source Han Serif SC」可变字重，正文 「Source Han Sans SC」。 */
  --font-sans: "PingFang SC","Microsoft YaHei","Hiragino Sans GB","Noto Sans SC",
               -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
  --font-serif: "Source Han Serif SC","Noto Serif SC","Songti SC","STSong","SimSun",
                Georgia,"Times New Roman",serif;
  --font-display: var(--font-serif);
  --font-num: Georgia,"Times New Roman","Songti SC",serif; /* 旧式数字：统计数值专用 */

  /* ===================== 字号 / 行高 / 字重阶梯 =====================
     正文 16px（移动端 15px），永不小于 14px；界面小字 13px（移动端不低于 13px）。
     行高按中文排印：正文 1.75，标题 1.35，界面元素 1.5。 */
  --fs-display: clamp(34px,5.2vw,52px);  /* 落地页 hero */
  --fs-h1: 28px;  --lh-h1: 1.30;  --fw-h1: 700;
  --fs-h2: 20px;  --lh-h2: 1.35;  --fw-h2: 600;
  --fs-h3: 16px;  --lh-h3: 1.45;  --fw-h3: 600;
  --fs-body: 16px; --lh-body: 1.75;
  --fs-sm: 14px;  --lh-sm: 1.65;
  --fs-xs: 13px;  --lh-xs: 1.55;
  --fs-micro: 12px;  /* 仅用于非必要元信息（时间戳、脚注），不承载操作 */
  --fw-body: 400; --fw-medium: 500; --fw-semi: 600; --fw-bold: 700;
  --measure: 68ch;  /* 长文最大行宽 */

  /* ===================== 间距：严格 4 的倍数 ===================== */
  --sp-1: 4px; --sp-2: 8px; --sp-3: 12px; --sp-4: 16px;
  --sp-5: 24px; --sp-6: 32px; --sp-7: 48px; --sp-8: 64px;

  /* ===================== 圆角：3 级，不再出现第 4 种 ===================== */
  --radius-xs: 4px;    /* 标签、徽章、小方块 */
  --radius-sm: 8px;    /* 输入框、按钮、列表项、qn */
  --radius:    12px;   /* 卡片、面板、弹窗 */
  --radius-lg: 12px;   /* 兼容旧名：与 --radius 同值，禁止再出现 16/18/20px */
  --radius-pill: 999px;/* 仅 nav 胶囊、badge、chip */

  /* ===================== 动效 ===================== */
  --ease: cubic-bezier(.32,.72,.28,1);   /* 标准 ease-out */
  --t-fast: .12s;   /* 按压反馈 */
  --t: .18s;        /* hover / 颜色 / 边框（≤200ms 硬线） */
  --t-slow: .22s;   /* 入场上限 */

  /* ===================== 图标（Lucide 线性 · mask 用；详见 §4） ===================== */
  --ic-chevron-right:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='1.75' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m9 18 6-6-6-6'/%3E%3C/svg%3E");
  --ic-check:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23FBF4E6' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 6 9 17l-5-5'/%3E%3C/svg%3E");
  --ic-x:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23FBF4E6' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M18 6 6 18M6 6l12 12'/%3E%3C/svg%3E");

  /* ===================== 兼容旧变量名（值已换，语义已改；禁止在新代码中使用） =====
     这些名字被三页 HTML 的内联 style 与 JS 拼串引用，改名会破坏「不可破坏清单」，
     故保留原名、只换值。迁移完成后可整体删除，但删除前必须全站 grep 确认零引用。 */
  --bg-0:var(--bg-page);
  --bg-1:var(--ink-1);           /* 旧「次深背景」在深墨面内即 ink-1 */
  --bg-2:var(--bg-card);

  /* ===================== z-index 固定阶梯（禁止再用任意数字） ===================== */
  --z-base: 0;
  --z-sticky: 20;       /* .exam-toolbar、.law-sticky-bar */
  --z-header: 50;       /* header */
  --z-navbar: 60;       /* 移动端底部 tab */
  --z-fab: 70;          /* .to-top、#ai-fab */
  --z-ai: 80;           /* AI 面板 */
  --z-live: 90;         /* .live 实时角标 */
  --z-toast: 300;
  --z-modal: 400;       /* 提到 toast 之上：弹窗内的操作反馈不能被 toast 遮挡后仍不可见 */
  --z-max: 500;
}

/* ===================== 深墨面作用域：一行切换整块区域的文字层级 =====================
   用法（HTML 只加 class，不动结构）：
     header            →  恒为深墨（无需额外 class）
     .footer .hero .result-head .live .toast  → 已自动套用（ink-1 面）
     .quote-card        →  更深的 ink-0 面，单独一条规则
     其他任意深色块     →  加 class="on-ink" */
.on-ink, header, .footer, .hero, .result-head, .live, .toast{
  color: var(--on-ink-2);
  background-color: var(--ink-1);
}
.quote-card{color:var(--on-ink-2);background-color:var(--ink-0)}
.on-ink h1,.on-ink h2,.on-ink h3,.on-ink b,.on-ink strong,
header h1, .footer .brand, .quote-card .quote-text,
.hero h2, .result-head .score{
  color: var(--on-ink);
}
.on-ink .muted, .on-ink .sub, .on-ink .meta, .on-ink .hint,
header .sub, .footer .sub-foot, .quote-card .quote-foot{
  color: var(--on-ink-muted);
}

/* 弃用清理：以下旧类不再有视觉语义，保留类名（JS/HTML 引用）但只做空实现，
   防止任何残留样式回潮。 */
.no-print{}
.seal,h1 .seal,.footer .seal,.hero::after{display:none!important;content:none!important}
```

### 1.2 颜色令牌与对比度总表（实测，WCAG 2.1）

背景定义：纸底 `#EAE0CE` / 卡片 `#F2E9D9` / 浮层 `#FBF4E6` / 凹陷 `#E1D5C0` / `surface-2` `#E4D8C2`。

| 令牌 | 色值 | 纸底 | 卡片 | 浮层 | 凹陷 | surface-2 | 达标 |
|---|---|---|---|---|---|---|---|
| `--ink` | `#241C14` | 12.83 | 13.93 | 15.33 | 11.57 | 11.91 | ✅ AA（正文） |
| `--text` | `#493D2E` | 8.07 | 8.76 | 9.64 | 7.28 | 7.49 | ✅ AA |
| `--muted` | `#5F4F3B` | 6.02 | 6.53 | 7.19 | 5.43 | 5.58 | ✅ AA |
| `--faint` | `#75634C` | 4.40 | 4.78 | 5.26 | 3.97 | 4.09 | ⚠️ 仅大字/占位（≥18px 或纯装饰）。**≥14px 正文不得使用 `--faint`** |
| `--primary` | `#2F6B4F` | 4.81 | 5.22 | 4.47 | — | — | ✅ AA（`--primary` 在浮层上 4.47，视为临界，浮层内文字改用 `--primary-d`） |
| `--primary-d` | `#245741` | 6.38 | 6.93 | 5.93 | — | — | ✅ AA |
| `--accent`= `--err` | `#9E3B2A` | 5.16 | 5.60 | 4.79 | — | — | ✅ AA |
| `--warn` | `#7A4A12` | 5.70 | 6.19 | 5.29 | — | — | ✅ AA |
| `--on-ink` | `#F6EEDF` | 深墨 ink-0 **15.82** / ink-1 **14.86** / ink-2 **13.49** | | | | | ✅ AA |
| `--on-ink-2` | `#DCCDB4` | 11.67 / 10.96 / 9.95 | | | | | ✅ AA |
| `--on-ink-muted` | `#B5A488` | 7.50 / 7.04 / 6.39 | | | | | ✅ AA |
| `--gold-l` | `#E0C58C` | 深墨 ink-1 **10.23** / ink-0 **10.89** | | | | | ✅ AA（装饰+文字） |
| `--gold` | `#C9A96E` | 对纸底 1.86 / 对 ink-1 7.65 / 对 ink-0 8.15 | | | | | ❌ 纸面上**仅装饰**；深墨面上可作文字 |
| `--err-soft` | `#C2604A` | 对卡片 3.44 / 对纸底 3.17 | | | | | ⚠️ **仅非文字元素**（边框、图标、进度条），不得承载正文 |

**实心块上的反白文字（`--on-accent: #FBF4E6`）**

| 实心块底 | 反白对比度 | 达标 | 备注 |
|---|---|---|---|
| `--primary #2F6B4F` | 5.75 | ✅ | 主按钮、nav.active |
| `--primary-d #245741` | 7.63 | ✅ | 按下/悬停态 |
| `--accent #9E3B2A` | 6.16 | ✅ | 危险按钮 |
| `--err #9E3B2A` | 6.16 | ✅ | 删除确认 |
| `--gold #C9A96E` + `--ink #241C14` | 7.50 | ✅ | **金色实心块的文字必须用墨色**；用反白只有 2.04 ❌ |

**答题对错三态（10% 淡底，实测）**

| 状态 | 文字/边框 | 10% 淡底 | 对比度 | 说明 |
|---|---|---|---|---|
| 正确 `.opt.correct` | `--ok #2F6B4F` | `#DEDCCB` | **4.56** ✅ | 墨绿，偏冷，与暖底分离 |
| 错误 `.opt.wrong` | `--err #9E3B2A` | `#EAD8C8` | **4.87** ✅ | 砖红 |
| 警告 `.badge.multi` | `--warn #7A4A12` | `#E6D9C5` | **5.36** ✅ | |
| 选中 `.opt.sel` | `--primary` 边框 2px | `--primary-l` | 边框 3.0+ ✅ 非文字 | |

<details>
<summary>对比度回归脚本（改令牌后必须重跑）</summary>

```bash
python - <<'PY'
def srgb(c):
    c/=255.0
    return c/12.92 if c<=0.04045 else ((c+0.055)/1.055)**2.4
def lum(h):
    h=h.lstrip('#'); r,g,b=(int(h[i:i+2],16) for i in (0,2,4))
    return 0.2126*srgb(r)+0.7152*srgb(g)+0.0722*srgb(b)
def ratio(a,b):
    la,lb=lum(a),lum(b)
    return (max(la,lb)+.05)/(min(la,lb)+.05)
BG={'paper':'#EAE0CE','card':'#F2E9D9','elevated':'#FBF4E6','inset':'#E1D5C0','s2':'#E4D8C2'}
FG={'ink':'#241C14','text':'#493D2E','muted':'#5F4F3B','faint':'#75634C',
    'primary':'#2F6B4F','primary-d':'#245741','accent':'#9E3B2A','warn':'#7A4A12'}
for fn,f in FG.items():
    print(fn, {bn:round(ratio(f,b),2) for bn,b in BG.items()})
PY
```
</details>

### 1.3 字号 / 行高 / 字重阶梯

| 角色 | 令牌 | 字号 | 行高 | 字重 | 字体 | 用途 |
|---|---|---|---|---|---|---|
| Display | `--fs-display` | `clamp(34px,5.2vw,52px)` | 1.15 | 700 | `--font-serif` | 仅落地页 hero H1 |
| H1 | `--fs-h1` | 28px（移动 24px） | 1.30 | 700 | `--font-serif` | 页面主标题 |
| H2 | `--fs-h2` | 20px | 1.35 | 600 | `--font-serif` | `.card h2`、区块标题 |
| H3 | `--fs-h3` | 16px | 1.45 | 600 | `--font-sans` | 小节标题 |
| 正文 | `--fs-body` | 16px（移动 15px） | 1.75 | 400 | `--font-sans` | 题干、解析、段落 |
| 界面 | `--fs-sm` | 14px | 1.65 | 400/500 | `--font-sans` | 按钮、表单、列表 |
| 小字 | `--fs-xs` | 13px | 1.55 | 600 | `--font-sans` | 表格头、标签、徽章 |
| 元信息 | `--fs-micro` | 12px | 1.5 | 400 | `--font-sans` | 时间戳、脚注（不承载操作） |
| 统计数值 | `.num/.big/.score` | 28–42px | 1.1 | 700 | `--font-num` | 必须 `font-variant-numeric:tabular-nums` |

规则：
- 标题一律 `text-wrap: balance`，段落 `text-wrap: pretty`；长文容器 `max-width: var(--measure)`。
- 中文正文 `letter-spacing: 0`（不要现站的 `.01em`）；大标题可 `-0.01em`；小号全大写标签 `0.06em`。
- 数字列、统计数字、进度百分比一律 `tabular-nums`。
- 衬线只用于 ≥18px 的标题与引语；界面控件、表格、按钮一律黑体。

### 1.4 间距节奏

`sp-1 4 / sp-2 8 / sp-3 12 / sp-4 16 / sp-5 24 / sp-6 32 / sp-7 48 / sp-8 64`（全部 4 的倍数）。

| 场景 | 取值 |
|---|---|
| 图标与文字 | `--sp-2` |
| 标签与输入框 | `--sp-2` |
| 表单字段之间 | `--sp-4` |
| 按钮组内 | `--sp-2`（行内）/ `--sp-3`（块间） |
| 卡片内边距 | 桌面 `--sp-5`，移动 `--sp-4` |
| 卡片之间 | `--sp-4` |
| 区块之间 | `--sp-7`（桌面）/ `--sp-6`（移动） |
| 标题上 / 下 | 上 `--sp-6`，下 `--sp-3`（**上方永远大于下方**） |
| 页面左右留白 | 桌面 `--sp-5`，移动 `--sp-4` + `env(safe-area-inset-*)` |

---

## 2. 基础层（`theme.css` §2–§4 替换）

```css
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}
body{
  font-family:var(--font-sans);
  font-size:var(--fs-body);
  line-height:var(--lh-body);
  color:var(--text);
  letter-spacing:0;
  min-height:100dvh;                       /* 不用 100vh */
  background-color:var(--bg-page);
  /* 纸的纤维：两层极低对比斜纹；不用图片，不产生额外请求 */
  background-image:
    repeating-linear-gradient(45deg,  rgba(120,96,64,.030) 0 1px, transparent 1px 6px),
    repeating-linear-gradient(-45deg, rgba(120,96,64,.022) 0 1px, transparent 1px 9px);
  -webkit-font-smoothing:antialiased;
  text-rendering:optimizeLegibility;
}

/* 浏览器原生表面：设计的一部分，必须由调色板上色 */
::selection{background:rgba(47,107,79,.20);color:var(--ink)}
::-webkit-scrollbar{width:10px;height:10px}
::-webkit-scrollbar-thumb{background:rgba(74,56,36,.26);border-radius:999px;border:2px solid transparent;background-clip:content-box}
::-webkit-scrollbar-thumb:hover{background:rgba(47,107,79,.55);background-clip:content-box}
::-webkit-scrollbar-track{background:transparent}
*{scrollbar-width:thin;scrollbar-color:rgba(74,56,36,.28) transparent}
input,textarea{caret-color:var(--primary)}
a{color:var(--primary-d);text-decoration:none;text-underline-offset:3px;transition:color var(--t)}
a:hover{color:var(--primary);text-decoration:underline}

/* 焦点：双环，任何背景上都可见（含金色实心块） */
:focus-visible{
  outline:3px solid rgba(47,107,79,.55);
  outline-offset:1px;
  box-shadow:0 0 0 2px var(--bg-elevated);
  border-radius:var(--radius-xs);
}
/* 用户强制色模式保留原生焦点 */
@media (forced-colors: active){ :focus-visible{outline:3px solid Highlight} }

.hidden{display:none!important}
.muted{color:var(--muted);font-size:var(--fs-sm)}

/* 跳过导航：键盘用户第一个 Tab 位（三页均需在 <body> 首行插入） */
.skip-link{position:absolute;left:-9999px;top:0;z-index:var(--z-max);
  background:var(--primary);color:var(--on-accent);padding:var(--sp-3) var(--sp-4);border-radius:var(--radius-sm)}
.skip-link:focus{left:var(--sp-4);top:var(--sp-4)}
```

---

## 3. 组件规范

> 通用四态纪律：**hover 变色 ≥1 档、active 位移 1px、focus 必可见、disabled 降不透明度但文字仍 ≥4.5:1**。
> 所有 `transition` 只写 `transform/opacity/background-color/border-color/color/box-shadow`，**禁止** `transition:all`（现站有 9 处 `transition:all`）。

### 3.1 按钮 `.btn` / `a.btn`

| 变体 | 常态 | hover | active | disabled | focus |
|---|---|---|---|---|---|
| `.btn`（primary） | 底 `--primary-grad`，字 `--on-accent` 5.75:1，`radius-sm`，`padding:8px 16px`，`fw-semi` | 底转 `--primary-d`，`translateY(-1px)` | `translateY(1px)` + `scale(.985)`，`--t-fast` | `opacity:.5`，`cursor:not-allowed`，无位移 | 双环 outline |
| `.btn.ghost` | 透明底，1px `--border-strong`，字 `--primary-d` 6.93:1 | `background:--primary-l`，边框 `--primary` | 同 primary | 同上 | 同 |
| `.btn.danger` | 底 `--accent`，字 `--on-accent` 6.16:1 | 底 `#8A3223` | 位移 | 同上 | 同 |
| `.btn.ok` | 底 `--primary`，字 `--on-accent` | 底 `--primary-d` | 位移 | 同上 | 同 |
| `.btn.sm` | `padding:6px 12px;font-size:--fs-xs` | — | — | — | — |
| `.btn.xs` | `padding:4px 10px;font-size:--fs-micro` | — | — | — | — |
| `.btn.loading`（JS 已加 `btn-loading`） | 前置 `.btn-spin`，文字「提交中…」，`aria-busy="true"` 由 JS 加；指针事件保留（防止重复提交已有 `disabled`） | — | — | `disabled` | — |
| `.btn.btn-done`（JS 加） | 底 `--ok-l`，1px `--ok`，字 `--primary-d`；`✓` 换成 `<svg class="ic ic-16">` check 图标 | 无（`cursor:default`） | 无位移 | — | — |

```css
.btn,a.btn{
  display:inline-flex;align-items:center;justify-content:center;gap:var(--sp-2);
  min-height:40px;padding:8px 16px;
  font-family:var(--font-sans);font-size:var(--fs-sm);font-weight:var(--fw-semi);
  color:var(--on-accent);background:var(--primary-grad);
  border:1px solid transparent;border-radius:var(--radius-sm);
  cursor:pointer;text-decoration:none;white-space:nowrap;   /* 禁止换行：CTA 一行 */
  box-shadow:0 1px 2px rgba(36,28,20,.18);
  transition:background-color var(--t),border-color var(--t),color var(--t),
             transform var(--t-fast),box-shadow var(--t);
}
.btn:hover,a.btn:hover{background-image:linear-gradient(180deg,#2F6B4F,#1F4A38);transform:translateY(-1px);box-shadow:0 2px 6px rgba(36,28,20,.20)}
.btn:active:not(:disabled),a.btn:active{transform:translateY(1px) scale(.985);box-shadow:none;transition-duration:var(--t-fast)}
.btn:disabled{opacity:.5;cursor:not-allowed;transform:none;box-shadow:none}
.btn.ghost{background:transparent;background-image:none;color:var(--primary-d);border-color:var(--border-strong);box-shadow:none}
.btn.ghost:hover{background-color:var(--primary-l);border-color:var(--primary);transform:translateY(-1px)}
.btn.danger{background-image:linear-gradient(180deg,#A8412E,#82301F)}
.btn.danger:hover{background-image:linear-gradient(180deg,#9E3B2A,#74291A)}
.btn.ok{background-image:linear-gradient(180deg,#357657,#245741)}
.btn.sm{min-height:32px;padding:6px 12px;font-size:var(--fs-xs)}
.btn.xs{min-height:28px;padding:4px 10px;font-size:var(--fs-micro)}
.btn.btn-done{background:var(--ok-l);background-image:none;color:var(--primary-d);border-color:var(--ok);cursor:default}
/* 移除旧「白光波纹」伪元素（§7 问题 4）：::after 不再承担按压反馈 */
.btn::after,a.btn::after{content:none!important}
.btn-spin{
  display:inline-block;width:14px;height:14px;flex:0 0 auto;
  border:2px solid rgba(251,244,230,.35);border-top-color:currentColor;border-radius:50%;
  animation:spin .7s linear infinite;
}
@keyframes spin{to{transform:rotate(360deg)}}
```

### 3.2 导航 tab `.nav`（顶栏）/ 移动端底部

| 状态 | 桌面（顶栏胶囊） | 移动端（底部 tab 条） |
|---|---|---|
| 默认 | 透明底，字 `--text`，1px `--border`，`radius-pill` | `flex:1`，图标 24px + 文字 `--fs-micro`，字 `--muted` |
| hover | `background:--surface`，边框 `--border-strong`，字 `--primary-d` | `background-color:--primary-l` 渐显 |
| focus-visible | 双环 | 双环 |
| 激活 `.active` | 底 `--primary`，字 `--on-accent` 5.75:1，`fw-semi`，**去掉金色渐变 + 去掉指示条光晕**，改由 `--shadow-glow`（底边 2px 赭金）承担书卷气 | 图标与文字转 `--primary-d`，顶部 2px `--primary` 指示条 |
| 按下 | `scale(.97)` | `scale(.96)` |
| 移动端指示条 | `.nav-indicator` 保留（JS 依赖），高度 2px，色 `--primary`，`box-shadow:none`（去光晕）；**父级 `.nav` 的 `overflow-x:auto` 会裁掉 `bottom:-3px` 的横条 —— 改为 `bottom:0`，见 §7 问题 5** | 隐藏 |

```css
.nav{display:flex;gap:var(--sp-2);flex-wrap:wrap;position:relative}
.nav button{
  display:inline-flex;align-items:center;gap:var(--sp-2);
  min-height:36px;padding:6px 14px;
  background:transparent;color:var(--text);
  border:1px solid var(--border);border-radius:var(--radius-pill);
  font-size:var(--fs-sm);font-weight:var(--fw-medium);font-family:inherit;
  cursor:pointer;white-space:nowrap;
  transition:background-color var(--t),border-color var(--t),color var(--t),transform var(--t-fast);
}
.nav button:hover{background-color:var(--surface);border-color:var(--border-strong);color:var(--primary-d)}
.nav button:active{transform:scale(.97)}
.nav button.active{
  background:var(--primary);color:var(--on-accent);border-color:transparent;
  font-weight:var(--fw-semi);box-shadow:inset 0 -2px 0 var(--gold);
}
.nav-indicator{background:var(--primary);box-shadow:none;height:2px;bottom:0}
.seg button,.tabs-mini button,.view-switch button{ /* 同源同款，仅字号与内距递减 */
  background:transparent;color:var(--text);border:1px solid var(--border);
  border-radius:var(--radius-pill);cursor:pointer;font-family:inherit;
  transition:background-color var(--t),border-color var(--t),color var(--t);
}
.seg button.active,.tabs-mini button.active,.view-switch button.active{
  background:var(--primary);color:var(--on-accent);border-color:transparent;font-weight:var(--fw-semi);
}
```

**移动端 ≤560px 底部 tab（替换现 `theme.css:194-199` 的横向滚动 nav）**

```css
@media (max-width:560px){
  .nav{
    position:fixed;left:0;right:0;bottom:0;z-index:var(--z-navbar);
    /* 9–11 项：两行网格。column 优先，行数超过 6 时自动转 3 行 */
    display:grid;grid-template-columns:repeat(auto-fit,minmax(56px,1fr));gap:2px;
    background:var(--ink-1);border-top:1px solid var(--rule-ink);
    padding:var(--sp-2) var(--sp-2) calc(var(--sp-2) + env(safe-area-inset-bottom));
    overflow:visible;flex-wrap:nowrap;
  }
  .nav button{
    flex-direction:column;gap:2px;min-height:44px;min-width:0;   /* 点击区 ≥44px */
    border:none;border-radius:var(--radius-sm);
    color:var(--on-ink-muted);font-size:var(--fs-micro);
    background:transparent;padding:4px 2px;
  }
  .nav button.active{
    background:rgba(201,169,110,.16);color:var(--gold-l);   /* 金 #E0C58C on ink-1 = 8.9:1 */
    box-shadow:inset 0 2px 0 var(--primary);
  }
  body{padding-bottom:calc(112px + env(safe-area-inset-bottom))}  /* 让位底部条（2 行） */
  .nav-indicator{display:none}
  main>section[id]{scroll-margin-top:16px}
  .to-top{bottom:calc(120px + env(safe-area-inset-bottom))}       /* 上移，避免被 tab 条盖住 */
  .to-top{width:44px;height:44px}                                 /* 移动端点击区 */
  #ai-fab{bottom:calc(120px + env(safe-area-inset-bottom))}
}
```

### 3.3 卡片 `.card` / `.dash-card` / `.course-card` / `.exam-card` / `.stat-box`

| 类 | 常态 | hover | 激活/focus | 规则 |
|---|---|---|---|---|
| `.card` | 底 `--bg-card`，1px `--border`，`radius`，`--shadow-sm`（**不要 `--shadow-lg`**），`padding:--sp-5` | 仅 `border-color:--border-strong`，**不位移**（长内容卡位移会造成阅读抖动） | 内部元素各自 focus | 大内容卡不做浮起 |
| `.card h2` | 衬线 20px/600 `--ink`；`::before` 是 3px 宽 × 16px 高的赭金短竖线（`--gold-d`，`radius-xs`，**去掉 drop-shadow 光晕**）；`::after` 延伸 1px 赭金细线到右端 | — | — | 卷首线的做法保留，这是本产品唯一合法的「古籍」装饰 |
| `.dash-card` | 底 `--bg-card`，1px `--border`，`radius`，`--shadow-sm`；`h3` 用 `--fs-xs`/600/`--muted`（**去掉 uppercase + 0.04em**，中文无大写）；`.big` 用 `--font-num` 32px/700/`--primary-d` | `translateY(-2px)` + `--shadow` | — | 数据卡允许 2px 浮起 |
| `.course-card` | `.ctop` 色带改为**赭金—墨绿双色细纹**：`background:linear-gradient(180deg,var(--gold-grad-soft)),var(--bg-inset)` + 2px 底边 `--gold`；卡片圆角 `--radius`；em `📘` 换成 `lucide:book-open` 16/20/24px | `translateY(-2px)` + `--shadow` | — | 不允许彩色渐变封面 |
| `.exam-card` / `.exam-card.ev-grid` | 底 `--bg-card`，1px `--border`，`radius-sm`，`--shadow-sm` | `translateY(-1px)`，`border-color:--border-strong` | — | 列表项位移 ≤1px |
| `.stat-box` | 底 `--bg-inset`，1px `--border`，`radius-sm`；`.num` `--font-num` 28px/700/`--primary-d` | **不位移**（现站 `.stat-box:hover .num` 的 `scale(1.05)` 删除） | — | 统计格是静态读数，不是按钮 |
| `.stat-box.zero`（新增，可选） | `.num` 用 `--muted` | — | — | 数值为 0 时降级，避免一屏金色 0 |

**取消全部玻璃层**（现 `theme.css:896-946` 整段删除）：

```css
.glass,.dash-card,.stat-box,.hero-stat,.course-card,.exam-card,.exam-group-head,.pill,.live-stats .s{
  position:static;overflow:visible;
  background:var(--bg-card);backdrop-filter:none;-webkit-backdrop-filter:none;
  border:1px solid var(--border);box-shadow:var(--shadow-sm);
}
.glass::before,.dash-card::before,.stat-box::before,.hero-stat::before,
.exam-card::before,.exam-group-head::before,.pill::before,.live-stats .s::before{content:none!important}
```

### 3.4 表格

| 状态 | 规则 |
|---|---|
| 表头 `th` | 底 `--bg-inset`，字 `--muted` 5.43:1，`--fs-xs`/600，`letter-spacing:0`，`border-bottom:1px --border-strong`；`position:sticky;top:0`（长表） |
| 单元格 `td` | 字 `--text`，`padding:10px 12px`，分隔线**只有 `border-bottom:1px --border`，不要 `border:1px` 四周框**（现 `teacher.html:163` 的 `th,td{border:1px solid…}` 把表格画成了 Excel 网格） |
| 行 hover | `background:--surface`（不要 `tr:hover td` 逐格上色） |
| 数值列 | 右对齐 + `font-variant-numeric:tabular-nums` + `--font-num` |
| `th` 可排序 `.ev-table th` | 右侧 16px `lucide:chevron-up-down`，默认 `--faint`，激活排序方向时用 `--primary-d` |
| ≤560px | 转卡片：`thead{display:none}`；`tr` 为 1px `--border` + `--bg-card` + `radius-sm`；`td{display:flex;justify-content:space-between}`；`td::before{content:attr(data-label)}` 用 `--muted`。**当前只有 `.ev-table` 做了这个转换，`teacher.html` 的班级分析表（`teacher.html:1525`）没有 `data-label`，必须补齐** |

```css
.tablewrap{overflow-x:auto;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg-card)}
table{width:100%;border-collapse:collapse;font-size:var(--fs-sm)}
th,td{text-align:left;padding:10px 12px;border:0;border-bottom:1px solid var(--border)}
th{background:var(--bg-inset);color:var(--muted);font-size:var(--fs-xs);font-weight:var(--fw-semi);white-space:nowrap}
tbody tr:last-child td{border-bottom:0}
tbody tr{transition:background-color var(--t)}
tbody tr:hover{background-color:var(--surface)}
td.num,th.num{text-align:right;font-family:var(--font-num);font-variant-numeric:tabular-nums;color:var(--primary-d);font-weight:var(--fw-semi)}
```

### 3.5 表单输入 `input / select / textarea`

| 状态 | 视觉 |
|---|---|
| 默认 | 底 `--bg-elevated`，1px `--border-strong`，`radius-sm`，`padding:10px 12px`，字 `--ink`，`min-height:40px` |
| 占位符 | `--faint`（4.78:1 on 浮层 ✅） |
| hover | `border-color:--border-strong` → `#A89372` |
| focus | `border-color:--primary` + `box-shadow:0 0 0 3px rgba(47,107,79,.18)` + **`outline:2px solid --primary-d` 保证强制色模式**，底保持 `--bg-elevated` |
| error `.is-invalid` | `border-color:--err`，`box-shadow:0 0 0 3px var(--err-l)`；**错误文案在输入框下方** `--color:--err`，13px；图标 `lucide:circle-alert` 16px |
| disabled | `opacity:.6`，底 `--bg-inset`，`cursor:not-allowed` |
| label | 在输入框**上方**，`--muted`，13px/600，`margin-bottom:var(--sp-2)`；**禁止用占位符代替 label** |

```css
label{display:block;font-size:var(--fs-xs);font-weight:var(--fw-semi);color:var(--muted);margin:var(--sp-4) 0 var(--sp-2)}
label:first-child{margin-top:0}
input,select,textarea{
  width:100%;min-height:40px;padding:10px 12px;
  font-family:var(--font-sans);font-size:var(--fs-sm);color:var(--ink);
  background:var(--bg-elevated);
  border:1px solid var(--border-strong);border-radius:var(--radius-sm);
  transition:border-color var(--t),box-shadow var(--t),background-color var(--t);
}
input::placeholder,textarea::placeholder{color:var(--faint)}
input:hover,select:hover,textarea:hover{border-color:#A89372}
input:focus-visible,select:focus-visible,textarea:focus-visible{
  outline:2px solid var(--primary-d);outline-offset:1px;
  border-color:var(--primary);box-shadow:0 0 0 3px rgba(47,107,79,.18);
}
input:disabled,select:disabled,textarea:disabled{opacity:.6;background:var(--bg-inset);cursor:not-allowed}
textarea{resize:vertical;min-height:96px}
.is-invalid{border-color:var(--err)!important;box-shadow:0 0 0 3px var(--err-l)!important}
.field-error{display:flex;align-items:center;gap:var(--sp-2);margin-top:var(--sp-2);font-size:var(--fs-xs);color:var(--err)}
.hint{font-size:var(--fs-xs);color:var(--muted);line-height:var(--lh-sm);margin:var(--sp-2) 0 var(--sp-4)}
```

### 3.6 弹窗 `.modal` / `.modal-box`

| 状态 | 规则 |
|---|---|
| 遮罩 | `rgba(26,20,16,.55)`（暖墨，不是冷黑），**`backdrop-filter` 删除** |
| 盒子 | 底 `--bg-elevated`，1px `--border-strong`，`radius`（12px，现为 20px），`--shadow-lg`，`padding:--sp-5`，`width:min(560px,92vw)`，`max-height:min(86dvh,780px)`，`overflow:auto` |
| 入场 | `@keyframes modalIn{from{opacity:0;transform:translateY(8px) scale(.985)}}`，`200ms var(--ease)` |
| 顶部 | `.modal-box h3` 衬线 20px/600 `--ink`；右上角**必须有关闭按钮**（`lucide:x` 20px，`aria-label="关闭"`，点击区 44×44） |
| 底部 `.modal-actions` | 右对齐，次要在左主按钮在右；`gap:--sp-2` |
| 键盘 | Esc 关闭、焦点陷阱、关闭后焦点回到触发元素（`teacher.html:554` 的 `ans-modal` **当前只能点遮罩/按钮关，缺 Esc 与 X**） |
| `.modal-tabs button` | 同 `.seg` 语言：默认字 `--muted`、1px `--border`；激活底 `--primary` 字 `--on-accent` |

### 3.7 Toast `.toast`

| 属性 | 规则 |
|---|---|
| 位置 | **顶部居中**保留（`top: var(--sp-5)`），但 `top` 要避开 header：`top:calc(var(--sp-5) + env(safe-area-inset-top))` |
| 底色 | 深墨 `--ink-1`，1px `--rule-ink`，字 `--on-ink`；`.ok` 左边框 2px `--primary`；`.err` 左边框 2px `--err` |
| 圆角/阴影 | `radius-sm` / `--shadow-ink`；**去掉 `backdrop-filter`** |
| 时长 | 进 180ms / 出 140ms `ease-out`，只用 `opacity + translateY(-6px)→0` |
| 停留 | 2200ms（现 JS 硬编码）→ 文案 >12 字需延长；**不改 JS** ⇒ 在 CSS 层通过 `max-width:min(92vw,420px)` 与 `line-height` 保证不折成 3 行 |
| 可访问 | 容器加 `role="status" aria-live="polite"`（HTML 属性，不动 JS） |
| z-index | `--z-toast` |

```css
.toast{
  position:fixed;top:calc(var(--sp-5) + env(safe-area-inset-top));left:50%;
  z-index:var(--z-toast);
  transform:translateX(-50%) translateY(-8px);opacity:0;pointer-events:none;
  max-width:min(92vw,420px);
  padding:var(--sp-3) var(--sp-4);
  background:var(--ink-1);color:var(--on-ink);
  border:1px solid var(--rule-ink);border-left:3px solid var(--gold);
  border-radius:var(--radius-sm);box-shadow:var(--shadow-ink);
  font-size:var(--fs-sm);line-height:var(--lh-sm);
  transition:opacity .18s var(--ease),transform .18s var(--ease);
}
.toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
.toast.err{border-left-color:var(--err)}
.toast.ok{border-left-color:var(--primary)}
@media (prefers-reduced-motion:reduce){.toast{transition:opacity .14s linear}}
```

### 3.8 空状态 `.empty-state`

```css
.empty-state{
  display:flex;flex-direction:column;align-items:center;gap:var(--sp-3);
  padding:var(--sp-7) var(--sp-4);text-align:center;color:var(--muted);
  border:1px dashed var(--border);border-radius:var(--radius);background:var(--surface);
}
.empty-state .ico{                       /* 旧写法是 48px emoji；改为图标容器 */
  display:grid;place-items:center;width:48px;height:48px;
  color:var(--gold-d);background:var(--bg-inset);border-radius:var(--radius-sm);
}
.empty-state .ico svg{width:24px;height:24px}   /* .ic-24 */
.empty-state .title{font-family:var(--font-serif);font-size:var(--fs-h3);color:var(--ink);font-weight:var(--fw-semi)}
.empty-state .desc{font-size:var(--fs-sm);line-height:var(--lh-sm);max-width:44ch;color:var(--muted)}
.empty-state .btn{margin-top:var(--sp-2)}       /* 一个明确的下一步动作 */
```
硬性要求：每个空状态**必须有且只有一个**主操作按钮（现 `student.html` 多处空状态只有一行灰字，如 `#my-report-body`「暂无报告。请等待老师…」——无动作，属于不合格空状态）。

### 3.9 加载骨架 `.skeleton` / `.spinner`

```css
.skeleton{
  background:linear-gradient(90deg,var(--bg-inset) 0%,var(--surface-2) 50%,var(--bg-inset) 100%);
  background-size:200% 100%;
  border-radius:var(--radius-xs);
  animation:shimmer 1.6s linear infinite;
}
@keyframes shimmer{from{background-position:200% 0}to{background-position:-200% 0}}
.spinner{
  width:24px;height:24px;margin:0 auto;
  border:2.5px solid var(--border);border-top-color:var(--primary);border-radius:50%;
  animation:spin .7s linear infinite;
}
@media (prefers-reduced-motion:reduce){
  .skeleton{animation:none;background:var(--bg-inset)}
  .spinner{animation-duration:1.6s}
}
```
规则：**骨架屏必须复刻真实布局形状**（卡片数、行数、列宽一致），且延迟 300ms 后再出现；不要用旋转圈替代可预测的列表/卡片加载。骨架只用在 `#exam-list`、`#dash-body`、`#course-list`、`#my-report-body` 这些有确定形状的容器。

### 3.10 徽标 / 标签 `.tag` / `.badge` / `.pill` / `.tag-done` / `.tag-draft`

统一：`radius-xs`（4px，方角复古标签）—— **唯一例外是状态徽章 `.badge` 与 `.pill` 用 `radius-pill`**，且这条例外必须全站一致。

| 类 | 底色 | 文字 | 对比度 |
|---|---|---|---|
| `.tag` / `.ev-cat-tag` / `.ev-tl-cat` | `--primary-l` | `--primary-d` | 6.93 ✅ |
| `.badge.choice` | `--primary-l` | `--primary-d` | 6.93 ✅ |
| `.badge.judge` / `.tag-done` | `--ok-l` | `--primary-d` | 6.93 ✅ |
| `.badge.multi` / `.tag-draft` | `--warn-l` | `--warn` | 6.19 ✅ |
| `.badge.err` | `--err-l` | `--err` | 5.60 ✅ |
| `.badge.rate-ok` | `--ok-l` | `--primary-d` | ✅ |
| `.badge.rate-mid` | `--warn-l` | `--warn` | ✅ |
| `.badge.rate-low` | `--err-l` | `--err` | ✅ |
| `.badge.rate-none` / `.tag-open` | `--bg-inset` | `--muted` | 5.43 ✅ |
| `.tag-ok` | `--ok-l` | `--primary-d` | ✅ |
| `.tag-warn` | `--warn-l` | `--warn` | ✅ |
| `.who-chip.ok` | `--ok-l` | `--primary-d` | ✅ |
| `.who-chip.bad` | `--err-l` | `--err` | ✅ |
| `.who-chip.na` | `--bg-inset` | `--muted` | ✅ |

```css
.tag,.ev-cat-tag,.ev-tl-cat,.badge.choice{
  display:inline-block;padding:2px 8px;border-radius:var(--radius-xs);
  background:var(--primary-l);color:var(--primary-d);
  font-size:var(--fs-micro);font-weight:var(--fw-semi);line-height:1.5;vertical-align:middle;
}
.badge{display:inline-block;padding:2px 10px;border-radius:var(--radius-pill);
  font-size:var(--fs-micro);font-weight:var(--fw-semi);line-height:1.6;white-space:nowrap}
.badge.judge,.tag-done,.badge.rate-ok,.tag-ok,.who-chip.ok{background:var(--ok-l);color:var(--primary-d)}
.badge.multi,.tag-draft,.badge.rate-mid,.tag-warn{background:var(--warn-l);color:var(--warn)}
.badge.err,.badge.rate-low,.who-chip.bad{background:var(--err-l);color:var(--err)}
.badge.rate-none,.tag-open,.who-chip.na{background:var(--bg-inset);color:var(--muted);border:1px solid var(--border)}
.pill{display:inline-flex;align-items:center;gap:var(--sp-2);padding:3px 10px;margin:2px;
  background:var(--bg-inset);border:1px solid var(--border);border-radius:var(--radius-pill);
  font-size:var(--fs-micro);color:var(--text)}
.pill.danger{background:var(--err-l);border-color:rgba(158,59,42,.28);color:var(--err)}
```
**禁止**：`teacher.html:111-123` 的 `#eef2ff/#4338ca`（靛蓝）、`#ecfdf5/#047857`、`#dcfce7/#15803d`、`#fef3c7/#b45309`、`#fee2e2/#b91c1c`、`#f1f5f9/#475569` —— 全部替换为上表令牌。

### 3.11 进度条 `.prog` / `.cat-bar` / `.bar` / `.bar-track`

```css
.prog,.cat-bar,.sl-prog{height:8px;background:var(--bg-inset);border:1px solid var(--border);
  border-radius:var(--radius-pill);overflow:hidden;box-shadow:none}
.prog>span,.cat-bar>i{display:block;height:100%;background:var(--primary);
  border-radius:var(--radius-pill);transition:width .32s var(--ease)}
.prog.accent>span{background:linear-gradient(90deg,var(--primary),var(--gold))}
.bar{height:26px;display:flex;overflow:hidden;border-radius:var(--radius-sm);
  background:var(--bg-inset);box-shadow:inset 0 0 0 1px var(--border);
  font-size:var(--fs-micro);color:var(--on-ink)}
.bar-item .bar-track{height:8px;background:var(--bg-inset);border-radius:var(--radius-pill);overflow:hidden}
.bar-fill{height:100%;border-radius:var(--radius-pill)}
@media (prefers-reduced-motion:reduce){.prog>span,.cat-bar>i{transition:none}}
```
规则：进度条只用 `width`（已完成部分）表达**一个**数值；不要渐变发光，不要条纹动画。窄屏（≤560px）`.cat-bar{flex:0 0 72px}`。

### 3.12 折叠块 caret `.caret` / `summary` / `.exam-group-head` / `.law-sec-head`

现状缺陷：caret 是**文本字符** `▸`（`interactions.js:80-86` 用 `caret.textContent='▸'` 硬写），且 `teacher.html:20/105` 用 `::before{content:'▸'}`，`student.html` 的 `details` 又各写一遍。

**契约（不改 JS）**：`.caret` 元素内的文本字符用 `font-size:0` 隐藏，用 `::before` 画一条 Lucide `chevron-right` 的 SVG mask；`interactions.js` 给 `.caret` 加 `.open` 类，CSS 负责旋转 90°。

```css
.caret,.law-sec-head::before,.exam-card-sum::before,.who-box>summary::marker{content:none}
.caret{
  display:inline-grid;place-items:center;width:16px;height:16px;flex:0 0 auto;
  font-size:0;                 /* 隐藏 JS 写入的 ▸ 字符，不动 JS */
  color:var(--muted);
  transition:transform .18s var(--ease),color var(--t);
}
.caret::before,.law-sec-head::before,.exam-card-sum::before{
  content:'';width:16px;height:16px;background-color:currentColor;
  -webkit-mask:var(--ic-chevron-right) center/16px 16px no-repeat;
          mask:var(--ic-chevron-right) center/16px 16px no-repeat;
}
.caret.open,.law-sec[open]>.law-sec-head::before,.exam-card-detail[open]>.exam-card-sum::before{
  transform:rotate(90deg);
}
.exam-group-head{cursor:pointer;user-select:none;padding:10px 14px;background:var(--bg-inset);
  border:1px solid var(--border);border-radius:var(--radius-sm);
  transition:background-color var(--t),border-color var(--t)}
.exam-group-head:hover{background:var(--surface);border-color:var(--border-strong)}
.exam-group-head .caret{color:var(--primary-d)}
.eg-body{border-left:1px solid var(--border);margin-left:var(--sp-4);padding:var(--sp-2) 0 var(--sp-1) var(--sp-4)}
@media (max-width:560px){.caret{width:24px;height:24px}}
```
`details > summary` 全部加 `list-style:none` + `::-webkit-details-marker{display:none}`，caret 用上面同一套。

### 3.13 其余复用组件（同源，只换令牌）

| 类 | 处理 |
|---|---|
| `.hero` / `.result-head` | 深墨块：`background:var(--ink-1)` + 顶部 2px `--gold` 细线（**不要径向渐变/发光**）；文字走 `.on-ink` 作用域。`.result-head .score` 用 `--font-num` + `--gold-l`（对 ink-1 8.9:1 ✅） |
| `.quote-card` | 深墨 `--ink-0`，**去掉左侧 3px 朱红竖条**（违反 craft-floor「有色 border-left >1px」禁令），改用顶部 2px `--gold` 规则线 + `::before` 引号用 `--font-serif` 大字号 `rgba(224,197,140,.28)`；`「金句」小印` 保留但改为 `--err-l` 底 + `--err` 字 + `--radius-xs` 的 4px 圆角方块（`#BE3D33→#8E261D` 渐变删除；`--err` 在 `--err-l` 上 4.87:1 ✅）。**删除 `.quote-card:hover` 的无限浮动** |
| `.lesson` / `.morning-item` / `.ev-row` / `.ev-tl-card` | `border:1px solid --border`；`.done/.checked{border-color:var(--ok);background:var(--ok-l)}`；hover 只改 `border-color:--border-strong`（`.ev-row:hover` 的 `translateX(2px)` 删除——列表整行横移会让文字模糊） |
| `.qn`（题号格） | 35×35 → **40×40**（点击区），`radius-sm`，默认字 `--muted`/底 `--bg-inset`；`.on` 底 `--primary` 字 `--on-accent`；`.done` 底 `--ok-l` 字 `--primary-d` + 右下角 8px `lucide:check` |
| `.opt`（选项） | 见 §3.14 |
| `.timeline` / `.ev-timeline` | 竖线 `linear-gradient(180deg,var(--gold),var(--border))` 1px；`.tl-item:before` 圆点用 `--bg-elevated` + 2px `--gold-d` 边框（**去发光**）；`.due` 用 `--warn` |
| `.linkbox` | `background:var(--bg-inset);border:1px dashed var(--border-strong);color:var(--primary-d);font-family:ui-monospace,"SFMono-Regular",Consolas,monospace`（仅在真需要复制粘贴的 URL 上用等宽） |
| `.print-area` | 保留白纸打印：`background:#fff;color:#1A1410`；`.pq .pa.right{color:#245741}`（打印态用墨绿保证 4.5:1） |
| `.to-top` | 40×40（移动 44×44），底 `--bg-elevated`，1px `--border-strong`，字 `--primary-d`；hover 底 `--primary-l`。`↑` 换成 `lucide:arrow-up` 20px |

### 3.14 答题选项与结果（本产品的核心交互）

```css
.opt{
  display:block;position:relative;padding:12px 14px;
  background:var(--bg-elevated);color:var(--text);
  border:1px solid var(--border-strong);border-radius:var(--radius-sm);
  font-size:var(--fs-body);line-height:var(--lh-sm);cursor:pointer;
  transition:background-color var(--t),border-color var(--t),transform var(--t-fast),box-shadow var(--t);
}
.opt:hover{background:var(--surface);border-color:var(--primary);transform:translateX(2px)}
.opt:active{transform:translateX(2px) scale(.995)}
.opt.sel{background:var(--primary-l);border-color:var(--primary);box-shadow:0 0 0 2px rgba(47,107,79,.16);color:var(--ink)}
.opt.correct{background:var(--ok-l);border-color:var(--ok);border-width:1.5px;color:var(--ink)}
.opt.wrong  {background:var(--err-l);border-color:var(--err);border-width:1.5px;color:var(--ink)}
/* 对错不只靠颜色：行内状态标改用图标（JS 写入的是 ✓ / ✗ 字形，CSS 层替换） */
.opt .mk{                       /* JS 结构：<span class="mk">✓</span>，无独立状态类 */
  display:inline-grid;place-items:center;width:18px;height:18px;margin-right:var(--sp-2);
  vertical-align:-4px;
  background-color:var(--ok);   /* 该 span 只出现在「正确」分支（student.html:310）⇒ 默认即正确态；
                                   student.html:981 的立法题里也用 .mk，语义同为「正确选项」 */
  border-radius:var(--radius-xs);
  font-size:0;                  /* 隐藏 ✓ / ✗ 字形，不动 JS */
}
.opt .mk::before{
  content:'';width:14px;height:14px;background-color:var(--on-accent);
  -webkit-mask:var(--ic-check) center/14px 14px no-repeat;
          mask:var(--ic-check) center/14px 14px no-repeat;
}
/* 反例：基础题列表里「✓ 正确」用的是 .badge.judge / .badge.err，其文字由 CSS 覆盖： */
.badge.judge::before,.badge.err::before{
  content:'';display:inline-block;width:12px;height:12px;margin-right:4px;vertical-align:-2px;
  background-color:currentColor;
  -webkit-mask:var(--ic-check) center/12px 12px no-repeat;
          mask:var(--ic-check) center/12px 12px no-repeat;
}
.badge.err::before{-webkit-mask-image:var(--ic-x);mask-image:var(--ic-x)}
/* JS 写入的 ✓ / ✗ 字形（student.html:310-311 等 12 处）统一用 .glyph-hide 兜住：
   语法 `<span class="mk" aria-hidden="true">✓</span>` 或 `<span class="tag-done">✓ 已完成</span>`。
   前者整段隐藏（纯装饰），后者保留文案、只把符号段换成图标。 */
.glyph-hide{font-size:0;line-height:0}
.glyph-hide>span,.glyph-hide>b{font-size:var(--fs-micro)}   /* 文案子节点恢复字号 */
.opt .opt-why{border-top:1px solid var(--border);margin-top:var(--sp-2);padding-top:var(--sp-2);
  font-size:var(--fs-xs);line-height:var(--lh-sm);color:var(--muted);font-weight:var(--fw-body)}
.opt.correct .opt-why,.opt.wrong .opt-why{color:var(--text)}
/* 删除：.opt.sel 的 optSel keyframes、.opt.picked 的 optPick（JS 会加类，CSS 只需无动画） */
.opt.picked{animation:none}
```
**硬性**：正确/错误必须有**非颜色**的第二重编码（图标 + 边框粗细）。色盲用户在当前实现下无法区分（现 `.opt.correct` 与 `.opt.wrong` 仅靠 `border-color` 与极低的 `background` 差异）。

对比度实测：`.opt.correct` 文字 `--ink` 在 `--ok-l` 上 **12.15:1** ✅；`.opt.wrong` 文字 `--ink` 在 `--err-l` 上 **11.39:1** ✅；`opt-why` 用 `--text` 在两者上分别 6.8+/5.9+ ✅。

### 3.15 AI 助手面板（`#ai-panel`，紫色渐变，必须重做）

现状：`teacher.html:1673-1697` / `student.html:1645-1680` 用 `linear-gradient(135deg,#6d5efc,#a855f7)` 紫色头 + `#f7f8fb` 浅底 + `#6d5efc` 按钮 —— **同时违反「不使用紫蓝渐变」与「暖色复古」两条方向**。

```css
#ai-fab{background:var(--primary);color:var(--on-accent);border:1px solid var(--primary-d);
  box-shadow:var(--shadow-lg);border-radius:var(--radius-pill);
  z-index:var(--z-fab);width:48px;height:48px}
#ai-panel{background:var(--bg-card);border:1px solid var(--border-strong);border-radius:var(--radius);
  box-shadow:var(--shadow-lg);font-family:var(--font-sans);z-index:var(--z-ai);
  max-height:min(540px,calc(100dvh - 140px))}
#ai-head{background:var(--ink-1);color:var(--on-ink);border-bottom:2px solid var(--gold);padding:12px 14px}
#ai-head button{background:rgba(246,238,223,.10);color:var(--on-ink);border:1px solid var(--hairline-ink);
  width:32px;height:32px;border-radius:var(--radius-xs)}      /* 点击区 ≥32 桌面，移动 44 */
#ai-msgs{background:var(--bg-page)}
.ai-msg{font-size:var(--fs-sm);line-height:var(--lh-sm);border-radius:var(--radius-sm);padding:8px 12px;max-width:88%}
.ai-msg.user{background:var(--primary);color:var(--on-accent);align-self:flex-end;
  border-bottom-right-radius:var(--radius-xs)}
.ai-msg.bot{background:var(--bg-elevated);color:var(--ink);border:1px solid var(--border);
  align-self:flex-start;border-bottom-left-radius:var(--radius-xs)}
.ai-reason{background:var(--bg-inset);color:var(--text);border-left:2px solid var(--border-strong);
  border-radius:var(--radius-xs);font-size:var(--fs-micro)}   /* 不要 >1px 的有色 border-left */
.ai-reason summary{color:var(--primary-d)}
.ai-typing{background:var(--muted)}
#ai-input{background:var(--bg-elevated);border-top:1px solid var(--border)}
#ai-input textarea{background:var(--bg-elevated);border:1px solid var(--border-strong);border-radius:var(--radius-sm)}
#ai-send{background:var(--primary);color:var(--on-accent);border-radius:var(--radius-sm);padding:0 16px}
.ai-mdl{border:1px solid var(--border-strong);background:var(--bg-inset);color:var(--text);border-radius:var(--radius-sm)}
.ai-mdl.active{background:var(--primary);border-color:var(--primary);color:var(--on-accent)}
.ai-pts{background:var(--warn-l);color:var(--warn);border:1px solid rgba(122,74,18,.24);border-radius:var(--radius-pill)}
.ai-hint{color:var(--muted)}
```

### 3.16 ECharts/Chart.js 图表配色（`teacher.html:1592-1637`、`student.html:1460-1523`）

JS 内硬编码的 `#3b6cf6`（蓝）/`#9aa3b2`（冷灰）/`rgba(59,108,246,.12)` 在暖墨底上完全脱色。**不改 JS 逻辑的前提下**，把常量替换为与新令牌同值的十六进制：

| 位置 | 现值 | 改为 |
|---|---|---|
| 折线/雷达主色 `borderColor` | `#3b6cf6` | `#2F6B4F` |
| 面积填充 `backgroundColor` | `rgba(59,108,246,.12)` | `rgba(47,107,79,.14)` |
| 雷达填充 | `rgba(59,108,246,.18)` | `rgba(47,107,79,.18)` |
| 班级对比虚线 | `#9aa3b2` | `#B5A488` |
| 分数档 ≥80 | `#2e9e5b` | `#2F6B4F` |
| 分数档 ≥60 | `#e0a800` | `#7A4A12` |
| 分数档 <60 | `#d9534f` | `#9E3B2A` |
| 进度槽（内联 style） | `#eef0f4` | `#E1D5C0` |
| 画布容器 `.chart-box` | `background:#fff` | `var(--bg-card)` + `1px var(--border)` |
| 网格线 | 默认灰 | `rgba(205,188,159,.6)`，刻度字 `#5F4F3B` |

Chart.js 全局默认可在 `interactions.js` 之外用页面内既有 `<script>` 设置（不需要改 `interactions.js`）：
```js
if(window.Chart){Chart.defaults.color='#5F4F3B';Chart.defaults.borderColor='rgba(205,188,159,.65)';
  Chart.defaults.font.family='PingFang SC, Microsoft YaHei, sans-serif';}
```

---

## 4. 图标规范

### 4.1 铁律

1. **统一 Lucide 线性图标**（Iconify 命名空间 `lucide:*`），24 viewBox，`stroke-width:1.75`，`fill:none`，`stroke:currentColor`，圆头圆角：
   `stroke-linecap="round" stroke-linejoin="round"`。
2. **禁止 emoji 充当 UI 图标**。正文/金句里的装饰性 emoji 除外（如 `quotes.js` 内容文本）。
3. 一个项目只有一套图标；**不得**混入 Font Awesome、Bootstrap Icons 或手绘路径。
4. 无构建步骤 ⇒ **不使用 CDN、不使用图标字体**。用内联 `<svg>` 或页面顶部一次性 `<svg><defs><symbol>`+`<use>`。
5. 图标**永远不是唯一的信息载体**：图标 + 文字，或图标 + `aria-label`。

### 4.2 `.ic` 类完整 CSS（现站 `.ic` 只有一处 `font-size:14px`，无定义 —— 本段即其定义）

```css
/* ---- 图标：Lucide 线性，24 viewBox，stroke 1.75 ---- */
.ic{
  display:inline-block;flex:0 0 auto;
  width:24px;height:24px;
  fill:none;stroke:currentColor;stroke-width:1.75;
  stroke-linecap:round;stroke-linejoin:round;
  vertical-align:-0.15em;          /* 与文字基线对齐：视觉居中，非数学居中 */
  overflow:visible;
  transition:color var(--t);
}
.ic-16{width:16px;height:16px;vertical-align:-0.14em}  /* 行内标签、徽章、表格、按钮后缀 */
.ic-20{width:20px;height:20px;vertical-align:-0.15em}  /* 按钮前缀、表单、列表项 */
.ic-24{width:24px;height:24px}                         /* 导航、空状态、标题、FAB（默认） */
.ic-32{width:32px;height:32px}                         /* 空状态插图、结果页 */

/* 与文字并排时的水平间距由 gap 承担，不要给图标加 margin */
.btn .ic,.nav button .ic,.chip .ic,.tag .ic{margin:0}
/* 图标按钮：兜住 44px 点击区 */
.icon-btn{display:inline-grid;place-items:center;width:44px;height:44px;
  background:transparent;border:0;border-radius:var(--radius-sm);
  color:var(--muted);cursor:pointer;transition:background-color var(--t),color var(--t)}
.icon-btn:hover{background:var(--surface);color:var(--ink)}
.icon-btn:active{transform:scale(.96)}
#ai-head button.icon-btn{width:32px;height:32px;color:var(--on-ink)}
@media (max-width:560px){#ai-head button.icon-btn{width:44px;height:44px}}

/* ---- SVG mask 图标：用于必须由 CSS 绘制图标的位置（nav 项、caret、空状态）
       变量本身定义在 §1.1 的 :root 内（--ic-chevron-right / --ic-check / --ic-x），
       此处只声明用法，不再重复定义。 ---- */
```

### 4.3 尺寸与对齐

| 尺寸 | 类 | 用途 |
|---|---|---|
| 16px | `.ic-16` | 行内文字旁、徽章、表格排序箭头、按钮内的后缀图标 |
| 20px | `.ic-20` | 按钮前缀、表单、列表项、Toast |
| 24px | `.ic-24`（`.ic` 默认） | 顶栏导航、底部 tab、空状态、卡片标题、浮动按钮 |
| 32px | `.ic-32` | 结果页大状态、空状态主图 |

对齐规则：
- 图标与文字同排一律用 `display:inline-flex; align-items:center; gap:var(--sp-2)`，靠 flex 居中，**不要**用 `margin-top` 硬调。
- 内联在文字流中的图标（如「链接已复制 ✓」）用 `vertical-align:-0.15em`（视觉居中），16px 用 `-0.14em`。
- 图标与文字之间水平间距固定 `--sp-2`（8px）；紧凑徽章内可 `--sp-1`（4px）。
- 图标按钮的**点击区 ≥44×44**，图标本身仍 20/24px。

### 4.4 现站 emoji 替换对照表（HTML 需替换，class/onclick 不动）

| 位置 | 现内容 | 替换为 Lucide |
|---|---|---|
| `student.html:67-75` nav 9 项 | `📊📚📝🌅👥❌🧠🗂📈` | `chart-no-axes-column` / `book-open` / `file-text` / `sunrise` / `users` / `circle-x` / `brain` / `folder-open` / `chart-line` |
| `index.html:117-118` CTA | `📝` `📊` | `pencil-line` / `chart-no-axes-column` |
| `index.html:131-136,144,150` 功能卡 | `📚📝🌅🧠❌👥🎓📋` | `book-open` / `file-text` / `sunrise` / `brain` / `circle-x` / `users` / `graduation-cap` / `clipboard-list` |
| `student.html:1203` 课程封面 `.ctop` | `📘` | `book-open` 24px |
| `index.html:158`、`student.html:1530`、`teacher.html:1644` 返回顶部 | `↑` | `arrow-up` |
| `interactions.js:149` 按钮完成态 | `✓ 已提交`（JS 写死） | **不改 JS**：`.btn.btn-done` 用 `::before` + `--ic-check` mask 覆盖字形（`text-indent` 技巧），并把 `font-size:0` 应用到该字符 —— 见下 |
| `teacher.html:1375,1480` 打卡统计 h2 | `✅` `⚠️` | `circle-check` / `triangle-alert` |
| `teacher.html:1377` 薄弱专题 h2 | `⚠️` | `triangle-alert` |
| `teacher.html:1413` 编辑课程 h2 | `✏️` | `pencil` |
| `student.html:1409` 结果徽章 | `✓ 已记住` `✗ 再记一次` | `check` / `rotate-ccw` |
| `student.html:110` 课堂题目 h2 | `📚` | `book-open` |

不改 JS 也能替换 JS 写入的字形（CSS 层）：
```css
/* JS 写了 '✓ 已提交' 与 '<span class="btn-spin"></span>提交中…'；文本节点无法单独选择，
   因此对 .btn-done 整体做「首字隐藏 + 图标覆盖」*/
.btn.btn-done{position:relative;padding-left:34px}
.btn.btn-done::before{
  content:'';position:absolute;left:12px;top:50%;transform:translateY(-50%);
  width:16px;height:16px;background-color:currentColor;
  -webkit-mask:var(--ic-check) center/16px 16px no-repeat;
          mask:var(--ic-check) center/16px 16px no-repeat;
}
```
同类：`.wrong-add.done`（JS 写 `textContent='✓ 已在错题本'`，`student.html:755`）
```css
.wrong-add{position:relative}
.wrong-add.done{padding-left:30px;font-size:0}
.wrong-add.done::before{
  content:'已在错题本';font-size:var(--fs-micro);   /* 恢复文案字号 */
}
.wrong-add.done::after{
  content:'';position:absolute;left:11px;top:50%;transform:translateY(-50%);
  width:14px;height:14px;background-color:currentColor;
  -webkit-mask:var(--ic-check) center/14px 14px no-repeat;
          mask:var(--ic-check) center/14px 14px no-repeat;
}
```

---

## 5. 动效规范

| 项 | 硬指标 |
|---|---|
| 交互反馈 | **≤200ms**。按压 `120ms`，hover/颜色/边框 `180ms` |
| 入场 | **160–240ms**，`ease-out`（`--ease` / `--ease-out-quint`） |
| 可动画属性 | **只有 `transform` 与 `opacity`**。`width` 例外仅限进度条填充（JS 驱动，已是既有行为），`box-shadow`/`background-color` 仅限小型局部元素 |
| 列表/卡片错峰 | 相邻项延迟 **≤40ms**，总延迟 ≤240ms，且**最多错峰 6 项** |
| 无限动画 | 只允许加载态（spinner/skeleton）。**删除** `.quote-card:hover` 的 `floatY 7s infinite`、`.opt:not(.sel)` 的常驻入场、`pulse` |
| 离屏暂停 | 任何循环动画用 `animation-play-state:paused` 配合 `IntersectionObserver`（不改 `interactions.js`，可在页面既有 `<script>` 内加） |
| 循环动画清单 | 只允许：`.skeleton`（shimmer）、`.spinner`/`.btn-spin`（spin）、`.ai-typing`（blink）。其余全部删除 |
| 降级 | `prefers-reduced-motion: reduce` 下：动画时长 0.01ms、`scroll-behavior:auto`、hover 位移取消、骨架屏改静态 |
| JS 动画库 | **禁止引入任何动画库**（GSAP / anime.js / Motion 一律不加） |

统一降级块（替换现 `theme.css:436-438` 与 `699-701` 两处重复定义，只保留一处）：
```css
@media (prefers-reduced-motion: reduce){
  *,*::before,*::after{
    animation-duration:.01ms!important;animation-iteration-count:1!important;
    transition-duration:.01ms!important;scroll-behavior:auto!important;
  }
  .card:hover,.dash-card:hover,.exam-card:hover,.course-card:hover,
  .stat-box:hover,.opt:hover,.btn:hover{transform:none!important}
  .skeleton{animation:none;background:var(--bg-inset)}
  html{scroll-behavior:auto}
}
```

### 5.1 动效片段（可直接粘贴）

**(1) 按钮按下**
```css
.btn:active:not(:disabled){
  transform:translateY(1px) scale(.985);
  transition-duration:120ms;
  transition-timing-function:cubic-bezier(.4,0,.6,1);
}
```

**(2) Tab 切换（沿用 JS 已加的 `section.tab-enter`）**
```css
@keyframes tabIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
section.tab-enter{animation:tabIn 180ms var(--ease) both}
/* 导航指示条：只用 transform，不用 width 动画（JS 会写 width，CSS 只管过渡曲线） */
.nav-indicator{transition:transform .2s var(--ease),opacity .14s linear,width .2s var(--ease)}
```

**(3) 卡片入场（每个容器只播一次，最多错峰 6 项）**
```css
@keyframes cardIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.card,.dash-card,.exam-card,.course-card,.stat-box{animation:cardIn 200ms var(--ease) both}
.card:nth-child(1){animation-delay:0ms}   .card:nth-child(2){animation-delay:32ms}
.card:nth-child(3){animation-delay:64ms}  .card:nth-child(4){animation-delay:96ms}
.card:nth-child(5){animation-delay:128ms} .card:nth-child(n+6){animation-delay:160ms}
/* 入场必须从「已可见默认」出发：不加 will-change，不叠加 hover 位移 */
```

**(4) 折叠展开（沿用 JS 的 `caret.open` + `.eg-enter`）**
```css
@keyframes egIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
.eg-enter{animation:egIn 180ms var(--ease) both}
.caret{transition:transform 160ms var(--ease),color var(--t)}
.caret.open{transform:rotate(90deg)}
```

**(5) Toast 进出**
```css
.toast{transition:opacity 180ms var(--ease),transform 180ms var(--ease)}
.toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
.toast:not(.show){transition-duration:140ms}
```

**(6) 选项选中（替代 optSel / optPick 的弹跳）**
```css
.opt{transition:background-color var(--t),border-color var(--t),transform 120ms var(--ease)}
.opt:active{transform:translateX(2px) scale(.995)}
/* 选中态不做回弹动画：答题是高频操作，弹跳会干扰阅读节奏 */
```

---

## 6. 移动端（≤560px）关键规则

沿用既有断点：`1200 / 900 / 768 / 680 / 560 / 520`。核心是 **560**。

| 项 | 规则 |
|---|---|
| **导航** | 顶栏横向滚动 nav → **底部固定 tab 条**（`--z-navbar`，两行 grid，`env(safe-area-inset-bottom)`），见 §3.2 |
| **底部留白** | `body{padding-bottom:calc(112px + env(safe-area-inset-bottom))}`；`.to-top` 上移至 tab 条之上 |
| **表格转卡片** | `thead` 隐藏；`tr` → 卡片；`td{display:flex;justify-content:space-between}` + `td::before{content:attr(data-label)}`。`.teacher` 班级分析表需补 `data-label` |
| **字号** | 正文 15px（≥13px 硬底线），H1 24px、H2 18px，界面 14px，小字仍 13px。**任何位置不得 <13px**（现站 `--fs-micro:11px` 与 `teacher.html:42/43/63/110/141`、`student.html:47/48` 共 8 处 11–11.5px 必须清除） |
| **断点归属** | `≤768`：`.opts-grid`/`.chart-grid` 单列、卡片内边距 `--sp-4`、hero 内距收窄；`≤680`：`.ev-grid`/`.ev-carousel-grid` 收窄、`.ev-row` 允许换行；`≤560`：底部 tab、表格转卡片、正文 15px、点击区 44px；`≤520`：`.stat-grid`/`.dash-grid` 固定 2 列、页脚居中 |
| **点击区** | 所有可点元素 **≥44×44**（含 `.btn.sm` 移动端升到 40→44、`.qn` 40、`.icon-btn`、nav 项、`.caret`）。视觉尺寸可小，用 `::after` 撑开命中区 |
| **间距** | 页面左右 `--sp-4`；卡片内 `--sp-4`；区块间 `--sp-6` |
| **行高** | 正文 1.75；题干 1.7；标签 1.5 |
| **单列** | `.opts-grid`、`.chart-grid`、`.dual-cta`、`.row>*` 全部单列；`.stat-grid`/`.dash-grid` 固定 2 列（不要 `auto-fit` 造成 3+1 的孤行） |
| **Hero** | 落地页 hero：`padding:--sp-7 var(--sp-4) --sp-5`；H1 `clamp(30px,9vw,38px)`；`.eyebrow` 保留但去掉发光；CTA 两个按钮**竖排、等宽 100%** |
| **底部吸底条** | `.law-sticky-bar` / `.exam-toolbar` 用 `position:sticky`（保留现有注释里的判断），加 `safe-area` 内边距；`.exam-toolbar{top:0}`（顶部 header 会随滚动隐藏） |
| **横向溢出** | `main{overflow-x:hidden}` 会裁掉浮层 ⇒ 改为对 `.tablewrap/.ev-table-wrap{overflow-x:auto}` 单独处理；`html,body{max-width:100%}` |
| **输入** | `font-size` 保持 ≥16px 的字段（`input`/`textarea` 在 iOS 上 <16px 会触发自动缩放）：把手持端 `input,select,textarea{font-size:16px}` 显式写入 |
| **打印** | 教师端导出仅桌面使用，但 `@media print` 必须保留且改为墨绿（`#245741`）而非 `#1e7a4d` |

---

## 7. 当前视觉问题清单（Top 5 + 附带项，附文件与行号）

**P1 · 教师端/学员端夹带两套旧浅色主题，与暖色体系正面冲突（最严重）**
- `teacher.html:8-176`（169 行页面级 `<style>`）：`#fff` 底（L54/L66/L115/L131/L167）、`#f8fafc`（L116 表头 / L318 代码块）、`#eef2ff/#4338ca`（L111）、`#ecfdf5/#047857`（L112）、`#fee2e2/#b91c1c`（L113）、`#f1f5f9/#475569`（L114、L123）、`#dcfce7/#15803d`（L120）、`#fef3c7/#b45309`（L121）、`#444/#555`（L38/L50/L63）、`#d9534f`（L153/L170）、`#eef1f5`（L157）、`#3b6cf6`（L152/L172）。
- `student.html:8-58`：`#f6f8fb`（L34）、`#eef1f5`（L39）、`#888`（L41）、`#fff`（L44/L52）、`#e6e9ef`（L44/L52/L54）、`#3b6cf6`（L45/L49）、`#f8fafc`（L54）、`#f1f5f9/#475569`（L57）。
- 后果：白底 + 深灰字的「浅色孤岛」出现在暖色页面里，且 `teacher.html:163` 的 `th,td{border:1px solid}` 与 `theme.css:355` 的 `border-bottom` 打架，表格被画成 Excel 网格。
- 处理：**这些页面级 `<style>` 整体删除**，全部收敛到 `theme.css`；`theme.css` 是全局唯一变量源。

**P2 · 「正确」与「品牌色」同色，语义塌陷**
- `theme.css:52` 定义 `--ok:#C9A45C`（金），`theme.css:982` 又覆盖为 `#58B99B`（青绿），`theme.css:985-990` 再逐条打补丁；同时 `teacher.html:40`、`teacher.html:64`、`teacher.html:142` 用 `#1d8a6f`，`teacher.html:171` 用 `#2e9e5b`，`student.html:1460` 用 `#2e9e5b` —— **同一「正确」概念出现 5 种绿，同一「品牌」概念出现 3 种金**。
- 后果：答题对错与品牌强调在视觉上无法区分；色盲用户完全无法分辨。
- 处理：按 §1.1 收敛为「正确 = `--ok` = `--primary` 墨绿」+ 非颜色第二重编码（§3.14）。

**P3 · AI 助手面板是紫色渐变，方向性错误**
- `teacher.html:1673-1697`：`#ai-fab` 与 `#ai-head` 用 `linear-gradient(135deg,#6d5efc,#a855f7)`，`#ai-msgs` 底 `#f7f8fb`，`#ai-send` 底 `#6d5efc`。
- `student.html:1645-1680`：同上（`#ai-fab`/`#ai-mdl.active`/`#ai-pnl`）。
- 后果：这是全站饱和度最高、面积最大的非暖色区域，直接推翻「暖色复古」；也是典型的 LLM 默认紫蓝审美。
- 处理：按 §3.15 全部换令牌。

**P4 · 玻璃拟态 + 无限动画 + 光晕，属于「数字感」而非「纸感」**
- `theme.css:896-946`：9 个组件统一 `backdrop-filter:blur(18px) saturate(1.5)` + 白色高光条 `::before`。
- `theme.css:639`：`.quote-card:hover` 叠加 `floatY 7s infinite`；`theme.css:400-401`：按钮 `::after` 白光波纹；`theme.css:1064-1066`：`.nav-indicator` 金色 `box-shadow:0 0 10px` 光晕。
- `theme.css:155-156`：`.card/.hero/.dash-card/.quote-card` 统一 `fadeUp .55s` + 四档 `nth-child` 延迟，`theme.css:413` 又给 `.q/.opt/.qa-row` 叠一层入场 —— 每次切题都在播动画。
- 处理：删除全部玻璃层与光晕，动画按 §5 重写（≤240ms，只动 transform/opacity，去掉无限循环）。

**P5 · `.nav-indicator` 在移动端被 `overflow-x:auto` 裁掉 / 完全被底部 tab 取代**
- `theme.css:1061-1068`：`.nav-indicator{bottom:-3px;height:3px}`，父级 `theme.css:194-196` 在 ≤768px 设 `overflow-x:auto` —— 绝对定位元素超出 padding box 即被裁切，指示条在移动端不可见。
- 另：`theme.css:191` 与 `theme.css:1070-1078` 对同一导航写了两套动效；`theme.css:1056` 的 `header.hd-hidden{transform:translateY(-108%)}` 会让 `main>section[id]{scroll-margin-top:84px}`（`theme.css:723`）失准。
- 处理：桌面 `bottom:0` 保留细条（去光晕）；≤560px 由底部 tab 条接管，`.nav-indicator{display:none}`；`scroll-margin-top` 在移动端降为 `16px`。

**附带项（同批修）**
1. `.ic` 类在 `theme.css:784` 被引用但**从未定义**；`interactions.js:80-86` 把 `▸` 写进 `.caret.textContent`。
2. `teacher.html:152`、`teacher.html:159`、`teacher.html:173`、`teacher.html:164` 引用**未定义变量** `--bg-soft`、`--bd`，字号 11/11.5px 出现 6 次（`teacher.html:42/43/110/141/L63`、`student.html:47/48`），低于 13px 底线。
3. `theme.css:333-401` 与 `theme.css:1070-1096` 是两拨叠加的动效层，同一选择器多处 `transition:all`（`.seg button`、`.tabs-mini button`、`.pp-btn`、`.view-switch button`、`.modal-tabs button`）——`transition:all` 会连 `width/height` 一起过渡，必须改成显式属性列表。
4. 同一元素重复 `class` 属性会**丢弃后者**：`student.html:103` `class="muted" class="mt-3"`、`student.html:285`、`student.html:1203` `.prog`、`student.html:1275/1279` `.stat-grid` —— 这些 `mt-*`/`text-err` 实际未生效。
5. `theme.css:52/982` 同名变量重复定义；`::selection`/滚动条/`.toast` 三处定义重复（`theme.css:111` vs `1038`，`112-115` vs `1037`）。
6. 打印样式 `theme.css:527` 用 `#1e7a4d`、`.print-area` 用 `#e2e8f0`（冷灰）——打印态也需落到新令牌（`#245741` / `#CDBC9F`）。
7. 空状态无动作：`student.html:254` `#my-report-body` 只有一句灰字；`theme.css:752-758` 的 `.empty-state` 也**没有**任何按钮样式约束。
8. `.result-head .score`（`theme.css:417`）用 `cubic-bezier(.2,1.4,.4,1)` 过冲曲线，`theme.css:1100` 的 golden 渐变与 `theme.css:1090` 的 `btn-done` 未走令牌 —— 过冲曲线一律改为 `--ease`。
9. **z-index 失控**：`teacher.html:1674`、`teacher.html:1678`、`student.html:1646`、`student.html:1650` 用 `z-index:9999`；`theme.css:167` header 用 `50`、`theme.css:378` modal 用 `200`、`theme.css:364` toast 用 `300`、`theme.css:572` `.exam-toolbar` 用 `20`、`theme.css:727` `.to-top` 用 `90`、`teacher.html:76` `.law-sticky-bar` 用 `40` —— 7 个来源、无阶梯、`toast(300) > modal(200)` 导致弹窗内反馈被 toast 覆盖。全部改 §1.1 的 `--z-*`。
10. `theme.css:784` `.view-switch button .ic{font-size:14px}` 是对**图标**用 `font-size` 的旧写法；`.ic` 改为尺寸类后此行必须删除，否则与 `.ic-16` 冲突。

---

## 8. 不可破坏清单（违反即回滚）

1. **类名、id、`onclick` / `onchange` / `data-*` 钩子，一个都不能改名或删除**（只允许**新增** class 或 HTML 属性用于纯视觉，如 `class="on-ink"`、`data-label`、`data-tab` 保持不变）。
2. **不改任何 JS 逻辑**：`interactions.js` 与三页内联 `<script>` 的业务函数（`submitExam`/`submitPractice`/`submitLawQ`/`submitMemory`/`submitMr`/`submitHw`、`tg()`、`toast()`、`api()`、Chart 渲染函数）**不改签名、不改流程**。JS 会写入的 class 必须在 CSS 里有对应规则：`hd-hidden`、`nav-indicator`、`tab-enter`、`eg-enter`、`caret.open`、`btn-loading`、`btn-spin`、`btn-done`、`picked`、`selected`、`active`、`hidden`、`done`、`checked`、`correct`、`wrong`、`on`、`sel`、`show`、`hot`、`base`、`ok`、`no`、`right`、`due`、`gray`、`green`、`yellow`、`red`、`rate-ok`/`rate-mid`/`rate-low`/`rate-none`、`opt-correct`/`opt-wrong`、`is-invalid`（若采用）。
3. **`public/css/theme.css` 是全站唯一的设计变量源**。三页必须且只能通过 `<link rel="stylesheet" href="/css/theme.css?v=...">` 引入；**页面级 `<style>` 只允许写本页专属布局（网格列数、个别宽度），不得出现任何字面颜色值、不得重定义任何 `--*` 变量、不得重定义任何共享 class**（现状违反：`teacher.html:8-176`、`student.html:8-58`、`index.html:8-101`）。
4. **三页都必须 `<link>` theme.css**；`index.html:7`、`teacher.html:7`、`student.html:7` 已满足，改版后保持。
5. **不改 HTML 结构**：不删节点、不移动节点层级、不改标签类型、不改文案（emoji → 图标属于替换文本内容，需在本契约授权范围内逐项执行，见 §4.4）。
6. **print 与 `prefers-reduced-motion` 两条分支必须保留有效**（现站两条 reduced-motion 块重复，合并为一处即可，但不能没有）。
7. 改版验收（沿用 `REDESIGN-LOG.md` 的红线）：`node --check`（内联脚本）+ `node check-student-robustness.js` 零崩溃；三页桌面 1440×900 与移动 390×844 截图比对；本文 §1.2 的对比度脚本重跑，任何 <4.5:1 的正文组合即为不合格。
