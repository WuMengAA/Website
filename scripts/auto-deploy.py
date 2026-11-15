#!/usr/bin/env python3
"""自动刷新上线：检测 a 树是否有新提交，有则跑 c8-deploy（含内容热更新）。
供 WorkBuddy 定时任务 / 真实主机计划任务调用。

行为
────
· 仅在 git HEAD 相对「上次成功部署标记」有变化时部署，避免无谓重建（c8-deploy 全量构建约 55s）。
· 部署成功写入 .deploy-state/last-sha；失败则保留旧标记，下次周期重试。
· 部署内含 content-sync（changelog/posts/pages/docs/projects 等白名单内容热更新）。

环境注意
────────
· ITH 卷对 agent 间歇不可见；不可见时 c8-deploy 会失败并保留旧标记，下个周期重试。
· 真实主机（D:\\Stellarith 恒可见）上用计划任务跑本脚本，可实现稳定自动上线。
"""
import os
import subprocess
import sys

REPO = os.environ.get("STELLARITH_WORKSPACE", r"D:/Stellara/stelarith-website")
STATE_DIR = os.path.join(REPO, ".deploy-state")
MARKER = os.path.join(STATE_DIR, "last-sha")
C8 = os.path.join(REPO, "scripts", "c8-deploy.py")


def git_head() -> str:
    r = subprocess.run(["git", "-C", REPO, "rev-parse", "HEAD"], capture_output=True, text=True)
    return r.stdout.strip()


def main() -> int:
    head = git_head()
    if not head:
        print("无法获取 git HEAD，中止。"); return 2
    prev = ""
    if os.path.exists(MARKER):
        with open(MARKER, encoding="utf-8") as f:
            prev = f.read().strip()
    if prev == head:
        print(f"无新提交（HEAD={head[:10]}），跳过部署。")
        return 0
    print(f"检测到新提交：{prev[:10] or '无'} → {head[:10]}，开始部署…")
    rc = subprocess.run([sys.executable, C8], cwd=REPO).returncode
    if rc != 0:
        print(f"部署失败（rc={rc}），保留旧标记，下次重试。")
        return rc
    os.makedirs(STATE_DIR, exist_ok=True)
    with open(MARKER, "w", encoding="utf-8") as f:
        f.write(head)
    print(f"部署成功，已记录 HEAD={head[:10]}。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
