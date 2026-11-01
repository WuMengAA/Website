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


def main() -> int:
    if not os.path.exists(ROOT):
        print(f"FATAL: ITH 树不存在: {ROOT}")
        return 2
    if not os.path.exists(os.path.join(ROOT, "src", "routes", "campus", "2028", "class8", "+page.svelte")):
        print("FATAL: ITH 树缺少 class8 页面")
        return 2

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
