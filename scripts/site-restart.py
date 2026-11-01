#!/usr/bin/env python3
"""安全重启站点源站（StelarithServer 计划任务）+ 验收。

为什么不用 release-site.mjs switch：那个会先 build 再切换，重且慢；
只是想"让新 .env / loadenv.cjs 生效"时，重启进程即可。

步骤：/end 任务 → /run 任务 → 轮询 8090 → 验收 / 与 /console/ 均 200。
失败会自动再拉起一次；仍失败则明确报告（不静默）。

用法: python scripts/site-restart.py
"""
import subprocess
import sys
import time
import urllib.request

TASK = "StelarithServer"
BASE = "http://127.0.0.1:8090"
CHECKS = ["/", "/console/"]


def http_code(url: str, timeout=4) -> int:
    try:
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code
    except Exception:
        return 0


def run(cmd: list[str]) -> tuple[int, str]:
    p = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    return p.returncode, (p.stdout or "") + (p.stderr or "")


def wait_up(deadline_sec: int = 90) -> bool:
    t0 = time.time()
    while time.time() - t0 < deadline_sec:
        codes = {c: http_code(BASE + c) for c in CHECKS}
        if all(v == 200 for v in codes.values()):
            print(f"  验收通过（{time.time() - t0:.1f}s）: " + ", ".join(f"{c}={v}" for c, v in codes.items()))
            return True
        time.sleep(2)
    codes = {c: http_code(BASE + c) for c in CHECKS}
    print("  验收未通过: " + ", ".join(f"{c}={v}" for c, v in codes.items()))
    return False


def main() -> int:
    print(f"重启前探针: " + ", ".join(f"{c}={http_code(BASE + c)}" for c in CHECKS))

    rc, out = run(["schtasks", "/end", "/tn", TASK])
    print(f"schtasks /end  rc={rc} {out.strip()[:120]}")
    time.sleep(1.5)

    rc, out = run(["schtasks", "/run", "/tn", TASK])
    print(f"schtasks /run  rc={rc} {out.strip()[:120]}")

    if wait_up():
        return 0

    print("\n首次拉起未通过验收，再试一次…")
    run(["schtasks", "/run", "/tn", TASK])
    if wait_up(60):
        return 0

    print("\n!! 重启失败，站点当前不可用，需要人工介入。")
    return 1


if __name__ == "__main__":
    sys.exit(main())
