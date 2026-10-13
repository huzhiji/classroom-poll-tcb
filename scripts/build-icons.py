# -*- coding: utf-8 -*-
"""构建 public/icons.svg（Lucide sprite，本地内联，不依赖任何外部 CDN 运行时请求）。

用法：
    python build-icons.py            # 校验 + 生成
    python build-icons.py --check    # 只校验，不写文件
数据来源：Iconify API  https://api.iconify.design/lucide/<name>.svg
"""
import io
import json
import os
import re
import sys
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "icons.svg")
UA = {"User-Agent": "Mozilla/5.0"}

# 用到的图标（全部为 lucide 正式名，别名已解析为父名）
ICONS = [
    "layout-dashboard",   # 仪表盘
    "book-open",          # 课程
    "file-text",          # 答题 / 考试
    "sunrise",            # 早读
    "users",              # 课堂
    "circle-x",           # 错题
    "brain",              # 记忆
    "chart-line",         # 记录
    "bar-chart-3",        # 报告 / 统计
    "database",           # 题库
    "clipboard-list",     # 考试管理 / 作业 / 历史报告
    "archive",            # 备份
    "mail",               # 提醒
    "library",            # 课程管理
    "user-search",        # 学生记录
    "file-question-mark", # 错题导出
    "graduation-cap",     # 学员 / 品牌
    "printer",            # 打印
    "download",           # 下载备份
    "cloud",              # 云端快照
    "play",               # 开始
    "rotate-ccw",         # 重置
    "arrow-up",           # 返回顶部
    "arrow-right",        # 进入 → 
    "sparkles",           # AI 分析
    "bot",                # AI 助教
    "trash",              # 清空对话
    "x",                  # 关闭
    "lightbulb",          # 说明 / 提示
    "book-marked",        # 语料记忆卡
    "user",               # 学生 / 学员
    "book-copy",          # 法律常识 / 模块
    "target",             # 打卡统计
]


def fetch_one(name, tries=4):
    """下载单个图标 SVG 并校验（HTTP 200 且返回 <svg>）。带退避重试。"""
    url = "https://api.iconify.design/lucide/%s.svg" % name
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=30) as r:
                if r.status != 200:
                    raise RuntimeError("%s HTTP %s" % (name, r.status))
                body = r.read().decode("utf-8")
            if "<svg" not in body:
                raise RuntimeError("%s 未返回 <svg" % name)
            return body
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(1.5 * (i + 1))
    raise RuntimeError(str(last))


def fetch_batch(names):
    """批量取 body（用于生成 sprite）。"""
    url = "https://api.iconify.design/lucide.json?icons=" + ",".join(names)
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def inner_paths(body):
    """取 <svg> 内层内容，去掉嵌套的 <g> 包裹，只留 path/circle/rect/line 等。"""
    m = re.search(r"<svg[^>]*>(.*)</svg>", body, re.S)
    # 单图标接口返回完整 <svg>；批量接口直接返回内层 <g>。
    inner = (m.group(1) if m else body).strip()
    if not inner:
        raise RuntimeError("empty svg body")
    # 剥掉 lucide 自带的 <g …> 外壳（描边属性改由 symbol 内的统一 <g> 提供）
    changed = True
    while changed:
        changed = False
        s = inner.strip()
        if s.startswith("<g") and s.endswith("</g>"):
            end = s.index(">")
            if s[end + 1:].rstrip().endswith("</g>"):
                candidate = s[end + 1:].rstrip()[: -len("</g>")].strip()
                if candidate.count("<g") == candidate.count("</g>"):
                    inner = candidate
                    changed = True
    inner = re.sub(r'\s*(?:fill|stroke|stroke-width|stroke-linecap|stroke-linejoin)="[^"]*"', "", inner)
    # 统一描边宽度（若有残留）
    inner = inner.replace('stroke-width="2"', 'stroke-width="1.75"')
    return inner.strip()


def main():
    check_only = "--check" in sys.argv
    print("校验 %d 个 lucide 图标（批量接口，逐个核对 not_found）…" % len(ICONS))
    d = fetch_batch(ICONS)
    icons = d.get("icons", {})
    aliases = d.get("aliases", {})
    missing = d.get("not_found", []) or []
    ok, bad = [], []
    for n in ICONS:
        if n in missing or (n not in icons and n not in aliases):
            bad.append((n, "not_found"))
            print("  FAIL %s -> 不存在于 lucide" % n)
        else:
            resolved = aliases.get(n, {}).get("parent", n)
            ok.append(n)
            print("  OK   %s%s" % (n, "" if resolved == n else "  (alias -> %s)" % resolved))
    if bad:
        print("有 %d 个图标未通过校验，终止。" % len(bad))
        return 1
    if check_only:
        print("全部通过（--check，未写文件）。")
        return 0
    out = ['<svg xmlns="http://www.w3.org/2000/svg" style="display:none">']
    for n in ok:
        if n not in icons:
            raise RuntimeError("batch 缺少 %s" % n)
        out.append(
            '  <symbol id="i-%s" viewBox="0 0 24 24">'
            '<g fill="none" stroke="currentColor" stroke-width="1.75" '
            'stroke-linecap="round" stroke-linejoin="round">%s</g></symbol>'
            % (n, inner_paths(icons[n]["body"]))
        )
    out.append("</svg>")
    text = "\n".join(out) + "\n"
    with io.open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    print("已写入 %s（%d symbols, %d bytes）" % (OUT, len(ok), len(text.encode("utf-8"))))
    return 0


if __name__ == "__main__":
    sys.exit(main())
