#!/usr/bin/env python3
"""单向同步：工作区源码树(a) → 部署实例(ITH)。

为什么需要它
────────────
线上跑的是 `D:\\Stelarith\\Stelarith-website\\stelarith`（ITH），而 IDE 打开的是
`D:\\Stellara\\stelarith-website`（a 树）。两棵树历史上靠人肉 cp 保持同步，
结果是「改了 a 树以为上线了，其实线上还是旧的」，或反过来把 ITH 的新改动覆盖掉。

约定（2026-11-01 起）
────────────────────
  · **a 树 + git 是唯一事实源**；ITH 是它的派生物，只额外持有「运行态数据」
    （content/ 数据库与上传、.env、node_modules、build 产物）。
  · 同步是**单向 a → ITH**，且只碰代码与静态资源，绝不碰运行态数据。
  · 有差异时默认**只报告不覆盖**（`--check`），要覆盖必须显式 `--apply`。

行尾符：两树历来 LF/CRLF 混杂（实测 438 条 diff 里 422 条只是行尾）。
比较时统一归一化，避免把换行差异当成代码差异刷屏。

用法
────
  python scripts/sync-to-ith.py                 # = --check，只报告
  python scripts/sync-to-ith.py --check         # 列出差异，不动文件
  python scripts/sync-to-ith.py --apply         # 实际覆盖（只覆盖 a 有、且内容不同者）
  python scripts/sync-to-ith.py --apply --force # 连同"仅 ITH 存在"的文件也一起报告后处理
"""
import filecmp
import os
import shutil
import sys

A_ROOT = os.environ.get("STELARITH_WORKSPACE", r"D:/Stellara/stelarith-website")
I_ROOT = os.environ.get("STELARITH_ROOT", r"D:/Stelarith/Stelarith-website/stelarith")

# 参与同步的路径（相对根）。**故意不含** content / .env / node_modules / build*
SYNC_DIRS = ["src", "scripts", "static", "tests"]
SYNC_FILES = [
    "package.json", "svelte.config.js", "vite.config.ts", "tsconfig.json",
    "loadenv.cjs", "site-crash-guard.cjs", ".gitignore",
]
# 这些文件名形态一律不参与（编辑器备份、编译中间物）
SKIP_SUFFIX = (".bak", ".bak-ef", ".orig", ".rej")
SKIP_NAMES = {".DS_Store", "Thumbs.db"}
# 产物目录：同步它们只会把截图/缓存糊到线上树
SKIP_DIRS = {".c8-out", "__pycache__", ".svelte-kit", "node_modules", ".turbo"}


def norm(path: str) -> bytes:
    """读文件并归一化行尾，用于内容比较（避免 LF/CRLF 假差异）。"""
    with open(path, "rb") as f:
        return f.read().replace(b"\r\n", b"\n")


def skip(name: str) -> bool:
    n = name.lower()
    return n in SKIP_NAMES or n.endswith(SKIP_SUFFIX) or ".bak-" in n or n in SKIP_DIRS


def walk_pairs():
    """产出 (相对路径, a 侧路径或 None, ITH 侧路径或 None)。"""
    for d in SYNC_DIRS:
        a_base = os.path.join(A_ROOT, d)
        i_base = os.path.join(I_ROOT, d)
        if not os.path.isdir(a_base):
            continue
        for root, dirs, files in os.walk(a_base):
            dirs[:] = [x for x in dirs if not skip(x)]
            for fn in files:
                if skip(fn):
                    continue
                ap = os.path.join(root, fn)
                rel = os.path.relpath(ap, A_ROOT)
                ip = os.path.join(I_ROOT, rel)
                yield rel, ap, (ip if os.path.exists(ip) else None)
    for fn in SYNC_FILES:
        ap = os.path.join(A_ROOT, fn)
        ip = os.path.join(I_ROOT, fn)
        if os.path.exists(ap):
            yield fn, ap, (ip if os.path.exists(ip) else None)


def collect():
    only_a, differ = [], []
    ithed = set()
    for rel, ap, ip in walk_pairs():
        if ip is None:
            only_a.append(rel)
        else:
            ithed.add(os.path.normpath(rel))
            try:
                if norm(ap) != norm(ip):
                    differ.append(rel)
            except OSError:
                differ.append(rel)
    # 仅 ITH 存在的代码文件（a 树没有 → 可能是别的 session 直接改在 ITH 上）
    only_ith = []
    for d in SYNC_DIRS:
        i_base = os.path.join(I_ROOT, d)
        if not os.path.isdir(i_base):
            continue
        for root, dirs, files in os.walk(i_base):
            dirs[:] = [x for x in dirs if not skip(x)]
            for fn in files:
                if skip(fn):
                    continue
                rel = os.path.normpath(os.path.relpath(os.path.join(root, fn), I_ROOT))
                if rel not in ithed:
                    only_ith.append(rel)
    return only_a, differ, only_ith


def main(argv) -> int:
    apply = "--apply" in argv
    mode = "APPLY" if apply else "CHECK"
    print(f"{'=' * 68}\n双树同步  a → ITH   模式: {mode}\n  a  : {A_ROOT}\n  ITH: {I_ROOT}\n{'=' * 68}")

    if not os.path.isdir(A_ROOT) or not os.path.isdir(I_ROOT):
        print("!! 任一树不存在，中止。")
        return 2

    only_a, differ, only_ith = collect()

    print(f"\n① 仅 a 树有（需复制过去）: {len(only_a)} 个")
    for p in only_a[:20]:
        print("   +", p)
    if len(only_a) > 20:
        print(f"   … 还有 {len(only_a) - 20} 个")

    print(f"\n② 两边内容不同（ITH 会被覆盖）: {len(differ)} 个")
    for p in differ[:20]:
        print("   ≠", p)
    if len(differ) > 20:
        print(f"   … 还有 {len(differ) - 20} 个")

    print(f"\n③ 仅 ITH 有（a 树没有 → 可能是别的 session 直接改在线上树）: {len(only_ith)} 个")
    for p in only_ith[:20]:
        print("   ?", p)
    if len(only_ith) > 20:
        print(f"   … 还有 {len(only_ith) - 20} 个")

    if not (only_a or differ):
        print("\n✅ 两侧代码一致，无需同步。")
        return 0

    if not apply:
        print("\n[CHECK] 未改动任何文件。确认上面清单后跑 --apply。")
        if differ:
            print("        ⚠️ ② 里的文件会被 a 树版本覆盖 —— 若 ITH 侧有未回流的新改动，先人工合并。")
        return 1

    print("\n── 开始同步 ──")
    n = 0
    for rel in only_a + differ:
        src = os.path.join(A_ROOT, rel)
        dst = os.path.join(I_ROOT, rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(src, dst)
        n += 1
    print(f"已复制 {n} 个文件到 ITH。")
    if only_ith:
        print(f"⚠️ ③ 的 {len(only_ith)} 个文件**未删除**（保守起见）。若确认它们已废弃，手工处理。")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
