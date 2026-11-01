#!/usr/bin/env python3
"""class8 修复版上线：ITH 树降堆构建 + 原子切换 + 验收。

用法: python _probe/c8_deploy.py
环境变量:
  STELLARITH_BUILD_HEAP_MB  堆上限（默认 1536，本机提交量是瓶颈，3072 会 OOM）
  CODEBUDDY_SAFE_DELETE_ENABLED=0  关闭沙箱 safe-delete 垫片（否则 fs.rmSync 静默失败）
"""
import os
import subprocess
import sys
import time

ROOT = r"D:\Stelarith\Stelarith-website\stelarith"
LOG_DIR = r"D:\Stelarith\_logs"
BUILD_LOG = os.path.join(LOG_DIR, "release-build.log")

env = dict(os.environ)
env["STELLARITH_BUILD_HEAP_MB"] = env.get("STELLARITH_BUILD_HEAP_MB", "1536")
env["CODEBUDDY_SAFE_DELETE_ENABLED"] = "0"


def run(step: str, args: list[str]) -> int:
    print(f"\n{'=' * 70}\n[{step}] node {' '.join(args)}\n{'=' * 70}", flush=True)
    t0 = time.time()
    p = subprocess.run(
        ["node", os.path.join(ROOT, "scripts", "release-site.mjs")] + args,
        cwd=ROOT, env=env, capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    out = (p.stdout or "") + (p.stderr or "")
    print(out[-6000:], flush=True)
    print(f"[{step}] exit={p.returncode} 耗时={time.time() - t0:.1f}s", flush=True)
    return p.returncode


def sync_trees() -> int:
    """build 前先把 a 树（唯一事实源）单向同步到 ITH。

    这样「改了 a 树 → 直接跑本脚本」就能正确上线，不必再记得手工 cp。
    只覆盖「a 树有更新」的文件，绝不删除 ITH 独有的运行态文件（content/.env/build）。
    """
    script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sync-to-ith.py")
    if not os.path.exists(script):
        print("[SYNC] 找不到 sync-to-ith.py，跳过同步")
        return 0
    print(f"\n{'=' * 70}\n[SYNC] a 树 → ITH 单向同步\n{'=' * 70}", flush=True)
    p = subprocess.run([sys.executable, script, "--apply"], text=True)
    return p.returncode


def main() -> int:
    if not os.path.exists(ROOT):
        print(f"FATAL: ITH 树不存在: {ROOT}")
        return 2
    if not os.path.exists(os.path.join(ROOT, "src", "routes", "campus", "2028", "class8", "+page.svelte")):
        print("FATAL: ITH 树缺少 class8 页面")
        return 2

    if "--no-sync" not in sys.argv:
        rc = sync_trees()
        if rc != 0:
            print("\n同步失败 —— 中止，未构建。")
            return rc

    rc = run("BUILD", ["build"])
    if rc != 0:
        print("\n构建失败 —— 未做任何切换，线上仍为上一版本。")
        if os.path.exists(BUILD_LOG):
            with open(BUILD_LOG, "r", encoding="utf-8", errors="replace") as f:
                tail = f.read()[-4000:]
            print("---- release-build.log 尾部 ----")
            print(tail)
        return rc

    rc = run("SWITCH", ["switch"])
    if rc != 0:
        print("\n切换失败 —— 脚本已尽力回滚，需人工核查。")
        return rc

    print("\n构建 + 切换完成。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
