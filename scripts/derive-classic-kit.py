#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Derive src/routes/classic-kit.css (the default "Claude / 克劳德" skin) from the
gated src/routes/endfield-kit.css.

endfield-kit.css is gated behind `html.theme-endfield`; classic-kit.css is its
UN-GATED sibling that paints the same .ex-* component vocabulary with the
site's default Claude palette (warm paper/ink, coral accent, rounded corners,
serif headings). Because classic-kit's rules are un-gated (default scope) and
endfield-kit's are gated (higher specificity), the Endfield skin overrides
Claude automatically when the opt-in skin class is present.

Transform steps:
  1. Drop the two endfield token blocks (html.theme-endfield / .dark).
  2. Emit Claude `:root` + `.dark` token blocks (coral/rounded/serif palette).
  3. Un-gate every other selector (strip `html.theme-endfield ` prefix).
  4. Drop `.ex-contours` rules (classic shows no contour; matches original).
  5. Neutralize corner cuts: --ex-cut-k -> 0 (clip-paths become full rects,
     cut-gradients become solid fills), then round via appended block.
  6. Replace the one hardcoded 5px cut polygon with border-radius.
  7. Append a Claude block: Lora headings + rounded component corners.

Reuses the tokenizer from gate-endfield-css.py (statement/block splitter).
"""
import io
import sys

GROUPING = {"@media", "@supports", "@container", "@layer", "@document"}

# ── Claude (克劳德) token palette ───────────────────────────────────────────
CLAUDE_ROOT = """/* 经典皮肤（默认）令牌：暖纸/墨 + 珊瑚橙 #cc785c + 圆角 0.5rem + 衬线标题。
   与 endfield-kit.css 同名变量一一对应；终末地皮肤（html.theme-endfield）以更高
   特异性覆盖这些变量与选择器。 */
:root {

  --ex-paper: #faf9f5;            /* 页面暖白 */
  --ex-panel: #ffffff;            /* 卡片 / 输入 */
  --ex-ink: #1b1b19;             /* 近黑暖墨字 */
  --ex-ink-2: #63625a;           /* 次要文字 */
  --ex-rule: #e7e3d8;            /* 暖色细线 */
  --ex-chip: #f0eee8;            /* 安静填充：chip / 闲置按钮 */
  --ex-signal: #cc785c;          /* 珊瑚橙：强调 / 可点击 */
  --ex-on-signal: #141413;       /* 珊瑚橙上的字 */
  --ex-trace: var(--ex-ink);
  --ex-tag-bg: var(--ex-ink);
  --ex-tag-fg: var(--ex-panel);
  --ex-danger: #b3261e;
  --ex-tri-a: #cc785c;           /* 三色条：珊瑚 / 琥珀 / 鼠尾草 */
  --ex-tri-b: #d8a657;
  --ex-tri-c: #7a8b6f;
  --ex-mark: color-mix(in srgb, var(--ex-signal) 35%, transparent);
  --ex-hatch: repeating-linear-gradient(-45deg, transparent 0 5px, color-mix(in srgb, var(--ex-ink) 14%, transparent) 5px 6.5px);

  --ex-font-ui: 'Saira Variable', 'Noto Sans SC Variable', 'Microsoft YaHei', 'PingFang SC', sans-serif;
  --ex-font-text: 'Noto Sans SC Variable', 'Microsoft YaHei', 'PingFang SC', sans-serif;
  --ex-font-mono: ui-monospace, 'SFMono-Regular', 'Cascadia Code', Consolas, monospace;
  --ex-wide: 100%;
  --ex-wider: 100%;

  --ex-t-h1: 2.5rem;
  --ex-t-title: 1.875rem;
  --ex-t-h2: 1.375rem;
  --ex-t-body: 1.0625rem;
  --ex-t-ui: 0.9375rem;
  --ex-t-field: 0.8125rem;

  --ex-measure: 40rem;
  --ex-pad: clamp(1rem, 4vw, 2.5rem);
  --ex-cut-k: 0;                 /* 经典皮肤：无切角（改圆角） */
  --ex-cut: calc(7px * var(--ex-cut-k));
  --ex-radius: 0.5rem;           /* 经典皮肤：圆角 */

  --ex-ease: cubic-bezier(0.2, 0.7, 0.1, 1);
  --ex-snap: cubic-bezier(0.16, 1, 0.3, 1);
  --ex-mech: cubic-bezier(0.7, 0, 0.2, 1);

  color-scheme: light;
}"""

CLAUDE_DARK = """.dark {

  --ex-paper: #1b1b19;
  --ex-panel: oklch(28% 0.004 106.6);
  --ex-ink: #faf9f5;
  --ex-ink-2: #b0aea5;
  --ex-rule: oklch(100% 0 0 / 0.16);
  --ex-chip: oklch(32% 0.004 106.6);
  --ex-signal: #cc785c;
  --ex-on-signal: #141413;
  --ex-trace: var(--ex-signal);
  --ex-tag-bg: oklch(40% 0.01 60);
  --ex-tag-fg: var(--ex-ink);
  --ex-danger: #ff8a7a;
  --ex-mark: color-mix(in srgb, var(--ex-signal) 22%, transparent);
  --ex-tri-a: #cc785c;
  --ex-tri-b: #d8a657;
  --ex-tri-c: #7a8b6f;
  --ex-hatch: repeating-linear-gradient(-45deg, transparent 0 5px, color-mix(in srgb, var(--ex-ink) 18%, transparent) 5px 6.5px);

  color-scheme: dark;
}"""

CLAUDE_TAIL = """
/* ── 经典皮肤补充：衬线标题 + 圆角 ──────────────────────────────────────────
   终末地规范把 ex 标题压成黑体（ex-font-ui）；经典皮肤恢复站点衬线（Lora）。
   圆角统一套用 --ex-radius：切角背景渐变在 --ex-cut-k:0 下已是实心填充，
   这里再补 border-radius 即得克劳德式圆角。:where() 保证特异性归零不压组件。 */
.ex :is(h1, h2, h3, h4) {
  font-family: var(--font-heading);
  font-weight: 600;
}
:where(.ex-tag, .ex-kv, .ex-chip, .ex-btn, .ex-sheet, .ex-sheet-head, .ex-plate,
       .ex-frame, .ex-panel, .ex-record, .ex-records, .ex-field, .ex-bar-title,
       .ex-eyebrow, .ex-group-head, .ex-search, .ex-empty, .ex-notice, .ex-marker,
       .ex-ledger, .ex-facts, .ex-actions, .ex-sections, .ex-drawer, .ex-dialog,
       .ex-toast, .ex-card, .ex-switch, .ex-seg, .ex-tabbar, .ex-topbar, .ex-rail,
       .ex-host, .ex-margin, .ex-spread, .ex-skeleton, .ex-progress, .ex-dial,
       .ex-cmdbar, .ex-form, .ex-setting, .ex-theming, .ex-table, .ex-table-wrap,
       .ex-rows, .ex-head, .ex-read, .ex-lede, .ex-pair, .ex-crumb, .ex-state,
       .ex-ticker, .ex-wordmark, .ex-plate, .ex-act, .ex-back, .ex-bars) {
  border-radius: var(--ex-radius);
}
"""


def split_top(sel):
    parts, depth, cur = [], 0, ""
    for ch in sel:
        if ch in "([":
            depth += 1
            cur += ch
        elif ch in ")]":
            depth -= 1
            cur += ch
        elif ch == "," and depth == 0:
            parts.append(cur)
            cur = ""
        else:
            cur += ch
    if cur.strip():
        parts.append(cur)
    return parts


def ungated_selector(raw):
    out = []
    for part in split_top(raw):
        p = part.strip()
        if not p:
            continue
        # remove the skin prefix; handle every way the gate script could attach it
        if p == "html.theme-endfield":
            p = ":root"
        elif p.startswith("html.theme-endfield "):
            p = p[len("html.theme-endfield "):]
        elif p.startswith("html.theme-endfield."):
            p = p[len("html.theme-endfield"):]      # .dark / .ex-theming / ...
        elif p.startswith("html.theme-endfield["):
            p = ":root" + p[len("html.theme-endfield"):]   # :root[data-...]
        # p may now be ".dark ..." or a normal selector
        out.append(p)
    return ",\n".join(out)


def tokenize(text):
    toks = []
    i, L = 0, len(text)
    while i < L:
        ch = text[i]
        if ch in " \t\r\n":
            i += 1
            continue
        if text[i:i + 2] == "/*":
            j = text.find("*/", i + 2)
            j = L if j == -1 else j + 2
            toks.append(("comment", text[i:j], None))
            i = j
            continue
        j = i
        while j < L and text[j] not in "{;":
            j += 1
        prelude = text[i:j]
        if j < L and text[j] == ";":
            toks.append(("stmt", prelude.strip(), None))
            i = j + 1
            continue
        depth, k = 1, j + 1
        while k < L and depth > 0:
            c = text[k]
            if c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
            k += 1
        toks.append(("block", prelude.strip(), text[j + 1:k - 1]))
        i = k
    return toks


def render(toks):
    out = []
    for kind, prelude, body in toks:
        if kind == "comment":
            out.append(prelude)
        elif kind == "stmt":
            out.append(prelude + ";\n")
        elif prelude.startswith("@"):
            name = prelude.split(None, 1)[0]
            if name in GROUPING:
                out.append(prelude + " {\n")
                out.append(render(tokenize(body)))
                out.append("}\n")
            else:
                out.append(prelude + " {\n")
                out.append(body)
                out.append("}\n")
        else:
            # style-rule block
            # skip the endfield token blocks (replaced by Claude blocks)
            if prelude.strip() in ("html.theme-endfield", "html.theme-endfield.dark"):
                continue
            # skip contour rules (classic shows no contour)
            if "ex-contours" in prelude:
                continue
            # skip pure-Endfield skin concerns (accent/paper/density/cut/motion
            # variants + theming view-transitions): endfield-kit already gates these.
            if "data-ex-" in prelude or "ex-theming" in prelude:
                continue
            out.append(ungated_selector(prelude) + " {\n")
            out.append(body)
            out.append("}\n")
    return "".join(out)


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else "src/routes/endfield-kit.css"
    dst = sys.argv[2] if len(sys.argv) > 2 else "src/routes/classic-kit.css"
    with io.open(src, "r", encoding="utf-8") as f:
        text = f.read()

    body = render(tokenize(text))

    # neutralize remaining corner-cut variants (0.6 / 1.6 -> 0)
    body = body.replace("--ex-cut-k: 0.6", "--ex-cut-k: 0")
    body = body.replace("--ex-cut-k: 1.6", "--ex-cut-k: 0")
    # the one hardcoded 5px cut polygon -> rounded
    body = body.replace(
        "clip-path: polygon(0 0, 100% 0, 100% calc(100% - 5px), calc(100% - 5px) 100%, 0 100%);",
        "border-radius: var(--ex-radius);",
    )

    header = "/* ==========================================================================\n" \
             "   classic-kit.css: 默认「克劳德」皮肤（endfield-kit.css 的未门控孪生体）\n" \
             "   --------------------------------------------------------------------------\n" \
             "   由 scripts/derive-classic-kit.py 从 endfield-kit.css 派生；不要手写编辑——\n" \
             "   改 endfield-kit.css 后重跑脚本即可重新生成。\n" \
             "   作用域：默认（无 html.theme-endfield）。终末地皮肤开启时其门控规则以\n" \
             "   更高特异性覆盖此处同名变量与选择器。\n" \
             " ========================================================================== */\n"

    result = header + CLAUDE_ROOT + "\n" + CLAUDE_DARK + "\n" + body + CLAUDE_TAIL

    with io.open(dst, "w", encoding="utf-8") as f:
        f.write(result)
    print(f"derived {dst}: {len(result)} bytes from {src}")


if __name__ == "__main__":
    main()
