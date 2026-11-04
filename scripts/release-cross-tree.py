#!/usr/bin/env python3
"""跨树原子发布 —— 双树物理合并的执行入口（受管 Python，不在 shell 里直接驱动生产）。

设计：在「构建根 ROOT（唯一事实源 a 树）」跑 vite build → 把 ROOT/build.next
搬进「部署根 DEPLOY（线上 ITH 实例）」→ 在 DEPLOY 原地原子切换 + 验收。
- build / stage 两个阶段**完全不碰线上 build/**，只有 switch 在停服窗口内改 DEPLOY/build。
- 失败自动回滚（release-site.mjs 内部已处理：旧版本保留为 build.old-*，验证不过回退）。

⚠️ 前置条件（执行前必须满足，否则 build 会直接失败，不会危害线上）：
  1. ROOT（a 树）已 npm install，存在 node_modules（构建在 a 树跑，不在 ITH）。
  2. DEPLOY（ITH）已存在 node_modules / content / .env / run-prod.bat（运行时依赖，不随 build 搬动）。
  3. 本脚本与 release-site.mjs 在 ROOT（a 树）侧，由本脚本以 cwd=ROOT 调起。

用法：
  python scripts/release-cross-tree.py                # 跨树 release（含停服窗口）
  python scripts/release-cross-tree.py --no-stage    # 只 build，本地验证产物
  python scripts/release-cross-tree.py status        # 看 DEPLOY 侧状态
  python scripts/release-cross-tree.py --deploy-root D:/other/ith   # 覆盖部署根
"""
import os
import sys
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
BUILD_ROOT = os.path.dirname(HERE)                        # a 树（唯一事实源）
# ITH 线上实例：路径按 StelarithServer 计划任务实际指向（Stellarth=TH，不是 Stellara=A）。
# 注意：该路径只存在于「源站」本机，本开发会话的 D: 里并无 D:\Stellarth；
# 本脚本必须由源站自身的 PowerShell 调起才能命中真实线上实例。
DEPLOY_ROOT = r"D:\Stellarth\Stelarith-website\stelarith"

HELP = "用法: python scripts/release-cross-tree.py [--no-stage] [status] [--build-root DIR] [--deploy-root DIR]"


def main() -> int:
    args = sys.argv[1:]
    if "-h" in args or "--help" in args:
        print(HELP)
        return 0

    build_root = BUILD_ROOT
    deploy_root = DEPLOY_ROOT
    no_stage = "--no-stage" in args
    cmd_status = "status" in args

    if "--build-root" in args:
        i = args.index("--build-root")
        build_root = args[i + 1]
    if "--deploy-root" in args:
        i = args.index("--deploy-root")
        deploy_root = args[i + 1]

    rel = os.path.join(build_root, "scripts", "release-site.mjs")
    if not os.path.exists(rel):
        print(f"FATAL: 找不到 {rel}")
        return 2

    # 前置自检：部署根至少得像线上实例
    if not os.path.exists(os.path.join(deploy_root, "node_modules")):
        print(f"WARN: 部署根 {deploy_root} 缺 node_modules（运行时依赖），发布后可能无法启动")
    if not os.path.exists(os.path.join(build_root, "node_modules")):
        print(f"FATAL: 构建根 {build_root} 缺 node_modules，无法在 a 树构建。先 `npm install`。")
        return 2

    env = dict(os.environ)
    env["STELLARITH_BUILD_HEAP_MB"] = env.get("STELLARITH_BUILD_HEAP_MB", "1536")
    env["CODEBUDDY_SAFE_DELETE_ENABLED"] = "0"
    env["STELLARITH_DEPLOY_ROOT"] = deploy_root

    sub = "status" if cmd_status else ("build" if no_stage else "release")
    print(
        f"== 跨树发布 ==\n  build_root ={build_root}\n  deploy_root={deploy_root}\n  动作      ={sub}",
        flush=True,
    )
    p = subprocess.run(
        ["node", rel, sub],
        cwd=build_root,
        env=env,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    return p.returncode


if __name__ == "__main__":
    sys.exit(main())
