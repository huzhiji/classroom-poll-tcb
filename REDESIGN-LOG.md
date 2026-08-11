# 网站视觉重构 - 版本记录（REDESIGN-LOG）

> 本文件记录 2026-08-11 起对教师端/学生端/首页进行的全面视觉重构。
> **回滚方法**：每个阶段对应一个 git tag + 一份本地 zip 存档，可精确回退到任意阶段。

## 存档位置与回滚方式

- **git tag**：`redesign-v0`、`redesign-v1`、`redesign-v2`、`redesign-v3`、`redesign-v4`（对应 Phase 0~4）。
- **本地 zip 存档**：`D:\Backup\classroom-redesign-archive\phase-N-*.zip`（完整源码，不含 node_modules/.git）。
- **回滚命令**：
  ```bash
  git checkout redesign-v2 -- public/       # 只回退前端到 Phase 2 版本
  # 或整库回退：
  git checkout redesign-v2
  # 或从 zip 恢复（最彻底）：解压对应 phase-N 的 zip 覆盖项目目录
  ```

## 阶段计划

| 阶段 | 内容 | 存档点 |
|------|------|--------|
| Phase 0 | 原版本完整备份 + 本记录体系 | `redesign-v0` / `phase-0-original-960686c.zip` |
| Phase 1 | 设计系统（配色/字体/间距/动效 tokens）+ 共享 `public/css/theme.css` | `redesign-v1` |
| Phase 2 | 教师端 teacher.html 视觉重构 | `redesign-v2` |
| Phase 3 | 学生端 student.html 视觉重构 + 新增首页 index.html | `redesign-v3` |
| Phase 4 | 动效交互润色 + 全站验证（语法/健壮性/截图） | `redesign-v4` |

## 设计原则（防破坏红线）

1. **不动任何 JS 逻辑**：所有 `id`、`class`、`onclick`、`data-*` 钩子保持不变，只改视觉（CSS + 少量 HTML 结构）。
2. 共享样式收敛到 `public/css/theme.css`；页面内仅保留个性化覆盖。
3. 动效遵守 `prefers-reduced-motion`，不干扰答题/课堂等高频交互。
4. 每阶段完成必须通过：`node --check`（内联脚本语法）+ `node check-student-robustness.js`（零崩溃回归）。

## 阶段记录

### Phase 0（2026-08-11 21:49）✅
- 当前线上版本 `960686c` 完整备份 → `D:\Backup\classroom-redesign-archive\phase-0-original-960686c.zip`
- git tag：`redesign-v0`
