# -*- coding: utf-8 -*-
"""统一图标系统 · 自检脚本（只读，不修改任何文件）。

检查项：
  1. 三页内联 <script> 块与 <style> 块内容是否与基线一致（基线文件由 --baseline 生成）
  2. HTML 结构：标签配平、无残留半截 emoji / 变体选择符
  3. 三页引用的每个 #i-xxx 都存在于 public/icons.svg
  4. icons.svg 里每个 symbol 都至少被一页引用（无冗余）
  5. icons.svg 规范：24 viewBox / fill=none / stroke=currentColor / stroke-width=1.75 / round 端点
  6. 每个 <svg class="ic"> 都有 aria-hidden="true"
  7. UI emoji 残留清单
用法：
  python check-icons.py --baseline    # 写入基线（第一次运行，改动前）
  python check-icons.py               # 执行自检
"""
import hashlib
import io
import json
import os
import re
import sys
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB = os.path.join(ROOT, "public")
PAGES = ["index.html", "teacher.html", "student.html"]
BASELINE = os.path.join(ROOT, "scripts", ".icons-baseline.json")

# 可能作为 UI 图标出现的 emoji / 符号（排除正文语气装饰用不到的范围）
EMOJI_RE = re.compile(
    "[\U0001F000-\U0001FAFF\u2190-\u21FF\u2300-\u27BF\u2B00-\u2BFF"
    "\u2600-\u26FF\uFE0F\u200D]"
)
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link",
        "meta", "param", "source", "track", "wbr"}
# HTML 里可以合法省略闭合标签的元素（不参与配平判定）
OPTIONAL_END = {"p", "li", "option", "tr", "td", "th", "thead", "tbody", "tfoot"}


def read(name):
    return io.open(os.path.join(PUB, name), encoding="utf-8", newline="").read()


def script_blocks(s):
    return re.findall(r"<script\b[^>]*>(.*?)</script>", s, re.S)


def style_blocks(s):
    return re.findall(r"<style\b[^>]*>(.*?)</style>", s, re.S)


def sha(t):
    return hashlib.sha256(t.encode("utf-8")).hexdigest()[:16]


def spans(s):
    """返回 (script|style) 内容区间，用于判定 emoji 是否处于代码块内。"""
    out = []
    for m in re.finditer(r"<(script|style)\b[^>]*>(.*?)</\1>", s, re.S):
        out.append((m.group(1), m.start(2), m.end(2)))
    return out


def in_code(s, i, sp):
    for _, a, b in sp:
        if a <= i < b:
            return True
    return False


class Balance(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.errors = []
        self.tagcount = {}

    def handle_starttag(self, tag, attrs):
        self.tagcount[tag] = self.tagcount.get(tag, 0) + 1
        if tag not in VOID:
            self.stack.append((tag, self.getpos()))

    def handle_startendtag(self, tag, attrs):
        self.tagcount[tag] = self.tagcount.get(tag, 0) + 1

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        if not self.stack:
            self.errors.append("多余闭合 </%s> at %s" % (tag, self.getpos()))
            return
        if self.stack[-1][0] == tag:
            self.stack.pop()
            return
        # 允许可省略闭合标签的元素被隐式闭合
        while self.stack and self.stack[-1][0] in OPTIONAL_END:
            self.stack.pop()
            if self.stack and self.stack[-1][0] == tag:
                self.stack.pop()
                return
        self.errors.append("标签不匹配 </%s> at %s，栈顶 %s" % (tag, self.getpos(), self.stack[-1]))


def main():
    mode_baseline = "--baseline" in sys.argv
    if mode_baseline and os.path.exists(BASELINE):
        print("基线已存在，删除后重跑以避免覆盖：%s" % BASELINE)
        return 1

    data = {p: read(p) for p in PAGES}
    sprite = read("icons.svg")

    if mode_baseline:
        base = {
            p: {
                "scripts": [sha(x) for x in script_blocks(data[p])],
                "styles": [sha(x) for x in style_blocks(data[p])],
                "emoji": sorted(set(EMOJI_RE.findall(data[p]))),
            }
            for p in PAGES
        }
        with io.open(BASELINE, "w", encoding="utf-8") as f:
            json.dump(base, f, ensure_ascii=False, indent=1)
        print("基线已写入 %s" % BASELINE)
        return 0

    base = json.load(io.open(BASELINE, encoding="utf-8")) if os.path.exists(BASELINE) else None
    fails = []

    print("=" * 66)
    print("1) 内联 <script> / <style> 完整性")
    for p in PAGES:
        sb, st = script_blocks(data[p]), style_blocks(data[p])
        line = "  %-13s script块=%d style块=%d" % (p, len(sb), len(st))
        if base:
            ok = [sha(x) for x in sb] == base[p]["scripts"] and [sha(x) for x in st] == base[p]["styles"]
            line += "  与基线一致: %s" % ("是" if ok else "否 ← 失败")
            if not ok:
                fails.append("%s 的 script/style 被改动" % p)
        print(line)

    print("2) HTML 结构（标签配平）")
    for p in PAGES:
        b = Balance()
        b.feed(data[p])
        leftover = [t for t, _ in b.stack]
        ok = not b.errors and not leftover
        print("  %-13s 错误=%d 未闭合=%s -> %s" % (p, len(b.errors), leftover or "无", "通过" if ok else "失败"))
        for e in b.errors[:6]:
            print("      ! %s" % e)
        if not ok:
            fails.append("%s 标签不配平" % p)

    print("3) sprite 规范 & 引用双向校验")
    syms = re.findall(r'<symbol id="(i-[^"]+)" viewBox="([^"]+)">(.*?)</symbol>', sprite, re.S)
    sym_ids = [s[0] for s in syms]
    print("  %-13s symbol 数量 = %d" % ("icons.svg", len(sym_ids)))
    for sid, vb, body in syms:
        bad = []
        if vb != "0 0 24 24":
            bad.append("viewBox=%s" % vb)
        if 'fill="none"' not in body:
            bad.append("缺 fill=none")
        if 'stroke="currentColor"' not in body:
            bad.append("缺 stroke=currentColor")
        if 'stroke-width="1.75"' not in body:
            bad.append("缺 stroke-width=1.75")
        if 'stroke-linecap="round"' not in body or 'stroke-linejoin="round"' not in body:
            bad.append("端点/连接非 round")
        if bad:
            fails.append("%s 规范问题：%s" % (sid, bad))
    print("  规范检查：%s" % ("全部通过" if not any(f.startswith("i-") for f in fails) else "见失败项"))

    ref_counts = {}
    for p in PAGES:
        refs = re.findall(r'href="/icons\.svg#(i-[^"]+)"', data[p])
        ref_counts[p] = len(refs)
        missing = sorted({r for r in refs if r not in sym_ids})
        print("  %-13s 引用图标 %3d 处，缺失 symbol: %s" % (p, len(refs), missing or "无"))
        if missing:
            fails.append("%s 引用了不存在的 symbol: %s" % (p, missing))
    unused = [s for s in sym_ids if not any(s in data[p] for p in PAGES)]
    print("  sprite 中未被任何页面引用: %s" % (unused or "无（无冗余）"))
    if unused:
        fails.append("sprite 存在冗余 symbol: %s" % unused)

    print("4) <svg class=\"ic\"> 属性检查")
    for p in PAGES:
        svgs = re.findall(r"<svg[^>]*>", data[p])
        ic = [s for s in svgs if 'class="ic' in s]
        noaria = [s for s in ic if 'aria-hidden="true"' not in s]
        print("  %-13s .ic svg=%d 缺 aria-hidden=%d" % (p, len(ic), len(noaria)))
        if noaria:
            fails.append("%s 有 .ic 未加 aria-hidden" % p)

    print("5) emoji 残留（仅统计 HTML 标记区，脚本/样式区不计）")
    kept_all = {}
    for p in PAGES:
        s = data[p]
        sp = spans(s)
        found = {}
        for m in EMOJI_RE.finditer(s):
            if in_code(s, m.start(), sp):
                continue
            found[m.group(0)] = found.get(m.group(0), 0) + 1
        kept_all[p] = found
        print("  %-13s 标记区残留 emoji: %s" % (p, json.dumps(found, ensure_ascii=False) if found else "无"))

    print("=" * 66)
    if fails:
        print("自检失败 %d 项：" % len(fails))
        for f in fails:
            print("  - %s" % f)
        return 1
    print("自检全部通过。")
    print("（UI emoji 残留清单见第 5 节；映射与保留理由见 .skills/icon-map.md）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
