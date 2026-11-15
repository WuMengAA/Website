#!/usr/bin/env python3
"""内容热更新：a 树(源) → ITH(线上) 的「精选编辑型内容」单向同步。

为什么单独写、不直接复用 sync-to-ith
────────────────────────────────────
sync-to-ith 刻意不含整个 content/（那是运行态数据：DB / users / uploads / nav）。
但 content/ 里有一部分「受 git 跟踪、纯编辑型」内容（changelog / posts / pages / docs /
projects / roadmap / templates / archive），它们本就应该随部署上线、且服务器现读即生效。
本脚本只同步这一小撮「白名单」，绝不碰任何运行态种子文件，从而做到 Danger 0 安全。

白名单（相对 content/ 根，POSITIVE allowlist）
────────────────────────────────────────────
  文件: changelog.json, roadmap.json
  目录: posts/, pages/, docs/, projects/, templates/, archive/
白名单之外的一切（含 git 跟踪但属运行态的种子：oauth-clients.json /
project-boards.json / forum-*.json / console-allow.json / doc-corrections.json /
links.json，以及未跟踪的 db / users.json / uploads / nav.json）一律不碰。

为什么安全
──────────
· 只遍历白名单内的文件，永远不读、不写白名单外的任何 content 路径。
· 只复制 a 树有、且内容不同的文件；绝不删除 ITH 任何文件（保守）。
· 比较时归一化行尾（LF/CRLF 不算差异），避免 438 条假差异刷屏。

用法
────
  python scripts/content-sync.py            # = --check，仅报告差异
  python scripts/content-sync.py --check    # 同上
  python scripts/content-sync.py --apply    # 实际复制白名单内容到 ITH
"""
import filecmp
import os
import shutil
import sys

A_ROOT = os.environ.get("STELARITH_WORKSPACE", r"D:/Stellara/stelarith-website")
I_ROOT = os.environ.get("STELARITH_ROOT", r"D:/Stellarith/Stelarith-website/stelarith")
A_CONTENT = os.path.join(A_ROOT, "content")
I_CONTENT = os.path.join(I_ROOT, "content")

# 正白名单：只有这些相对路径会被同步。其余一律不动。
ALLOW_FILES = ["changelog.json", "roadmap.json"]
ALLOW_DIRS = ["posts", "pages", "docs", "projects", "templates", "archive"]

# 编辑器备份 / 中间物
SKIP_SUFFIX = (".bak", ".bak-ef", ".orig", ".rej")
SKIP_NAMES = {".DS_Store", "Thumbs.db"}


def norm(path: str) -> bytes:
    with open(path, "rb") as f:
        return f.read().replace(b"\r\n", b"\n")


def skip(name: str) -> bool:
    n = name.lower()
    return n in SKIP_NAMES or n.endswith(SKIP_SUFFIX)


def walk_allow() -> list[tuple[str, str, str | None]]:
    """产 (相对 content 的路径, a 侧绝对路径, ITH 侧绝对路径或 None)。"""
    out = []
    for fn in ALLOW_FILES:
        ap = os.path.join(A_CONTENT, fn)
        if os.path.isfile(ap):
            out.append((fn, ap, os.path.join(I_CONTENT, fn)))
    for d in ALLOW_DIRS:
        base = os.path.join(A_CONTENT, d)
        if not os.path.isdir(base):
            continue
        for root, dirs, files in os.walk(base):
            dirs[:] = [x for x in dirs if not skip(x)]
            for fn in files:
                if skip(fn):
                    continue
                ap = os.path.join(root, fn)
                rel = os.path.relpath(ap, A_CONTENT).replace("\\", "/")
                out.append((rel, ap, os.path.join(I_CONTENT, rel)))
    return out


def collect():
    only_a, differ = [], []
    for rel, ap, ip in walk_allow():
        if ip is None or not os.path.exists(ip):
            only_a.append(rel)
        else:
            try:
                if norm(ap) != norm(ip):
                    differ.append(rel)
            except OSError:
                differ.append(rel)
    return only_a, differ


def main(argv) -> int:
    apply = "--apply" in argv
    mode = "APPLY" if apply else "CHECK"
    print(f"{'=' * 68}\n内容热更新  a → ITH   模式: {mode}\n  a  : {A_CONTENT}\n  ITH: {I_CONTENT}\n{'=' * 68}")

    if not os.path.isdir(A_CONTENT):
        print("!! a 树 content/ 不存在，中止。"); return 2
    if not os.path.isdir(I_ROOT):
        print("!! ITH 树不存在（可能真实主机不可见），中止。"); return 2

    only_a, differ = collect()
    print(f"\n① 仅 a 树有（将复制过去）: {len(only_a)} 个")
    for p in only_a[:30]:
        print("   +", p)
    if len(only_a) > 30:
        print(f"   … 还有 {len(only_a) - 30} 个")
    print(f"\n② 内容不同（ITH 将被 a 树版本覆盖）: {len(differ)} 个")
    for p in differ[:30]:
        print("   ≠", p)
    if len(differ) > 30:
        print(f"   … 还有 {len(differ) - 30} 个")

    if not (only_a or differ):
        print("\n✅ 白名单内容两侧一致，无需同步。")
        return 0

    if not apply:
        print("\n[CHECK] 未改动任何文件。确认清单后跑 --apply。")
        return 1

    print("\n── 开始内容热更新 ──")
    n = 0
    for rel in only_a + differ:
        src = os.path.join(A_CONTENT, rel)
        dst = os.path.join(I_CONTENT, rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(src, dst)
        n += 1
    print(f"已热更新 {n} 个内容文件到 ITH（未触碰任何运行态数据）。")
    print("提示：changelog / 单篇 post·page 服务器现读即生效；列表页(listCache)")
    print("      需等下次服务重启（c8-deploy switch）才刷新，属预期行为。")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
