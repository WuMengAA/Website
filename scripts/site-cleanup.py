#!/usr/bin/env python3
"""站点运维清理工具（2026-11-01 batch）。

做三件事，全部**可逆或可重建**：
  1. 历史构建备份移入回收站（release-site.mjs 只管 2 个 build.old，
     2026-09-27 / 10-04 的 4 份永久遗留 = 1,283 MB 里的 359 MB）
  2. 构建日志归档（release-build.log 34 MB 单文件从不轮转）
  3. 一次性 viewer-*.log / 空壳 .db 清理

用法:
  python scripts/site-cleanup.py dry     # 只列出将处理什么，不动任何文件
  python scripts/site-cleanup.py apply   # 实际执行（构建备份走回收站，日志走归档）
"""
import ctypes
import ctypes.wintypes as w
import glob
import os
import shutil
import sys
import time

ITH = r"D:\Stelarith\Stelarith-website\stelarith"
LOGS = r"D:\Stelarith\_logs"

FO_DELETE = 0x0003
FOF_ALLOWUNDO = 0x0040
FOF_NOCONFIRMATION = 0x0010
FOF_NOERRORUI = 0x0400
FOF_SILENT = 0x0004


class SHFILEOPSTRUCTW(ctypes.Structure):
    _fields_ = [
        ("hwnd", w.HWND), ("wFunc", w.UINT), ("pFrom", w.LPCWSTR), ("pTo", w.LPCWSTR),
        ("fFlags", ctypes.c_uint32), ("fAnyOperationsAborted", w.BOOL),
        ("hNameMappings", ctypes.c_void_p), ("lpszProgressTitle", w.LPCWSTR),
    ]


def to_recycle(path: str) -> bool:
    p = os.path.abspath(path)
    if not os.path.exists(p):
        return True
    op = SHFILEOPSTRUCTW()
    op.wFunc = FO_DELETE
    op.pFrom = p + "\0\0"
    op.fFlags = FOF_ALLOWUNDO | FOF_NOCONFIRMATION | FOF_NOERRORUI | FOF_SILENT
    rc = ctypes.windll.shell32.SHFileOperationW(ctypes.byref(op))
    return rc == 0 and not os.path.exists(p)


def dirsize(p: str) -> float:
    t = 0
    for r, _d, fs in os.walk(p):
        for x in fs:
            try:
                t += os.path.getsize(os.path.join(r, x))
            except OSError:
                pass
    return t / 1024 / 1024


def plan():
    items = []
    # 1) 历史构建备份：只清 release-site 不管的那几份（当前 build 与最新 build.old 保留）
    olds = sorted(glob.glob(os.path.join(ITH, "build.old-*")), key=os.path.getmtime, reverse=True)
    keep_old = set(olds[:1])  # 最新 1 份 build.old 留作回滚垫
    for p in glob.glob(os.path.join(ITH, "build-backup-*")) + glob.glob(os.path.join(ITH, "build.bak-*")):
        items.append(("构建备份", p, dirsize(p)))
    for p in olds:
        if p not in keep_old:
            items.append(("旧构建(build.old)", p, dirsize(p)))
    # 2) 空壳 db（路径拼接错误产物，0 字节）
    for p in glob.glob(os.path.join(ITH, "*.db")):
        if os.path.getsize(p) == 0:
            items.append(("空壳db", p, 0))
    return items


def plan_logs():
    items = []
    big = os.path.join(LOGS, "release-build.log")
    if os.path.exists(big):
        items.append(("归档构建日志", big, os.path.getsize(big) / 1024 / 1024))
    # 一次性 viewer-*.log（累计很小但污染目录）
    for p in glob.glob(os.path.join(LOGS, "viewer-*.log")):
        items.append(("一次性日志", p, os.path.getsize(p) / 1024 / 1024))
    return items


def main(mode: str) -> int:
    if mode not in ("dry", "apply"):
        print("用法: python scripts/site-cleanup.py dry|apply")
        return 2
    print(f"{'=' * 66}\n模式: {mode.upper()}\n{'=' * 66}")

    items = plan()
    total = 0.0
    print("\n── 1) 历史构建备份 / 空壳残留（回收站，可还原）──")
    for kind, p, mb in items:
        total += mb
        print(f"  {kind:16s} {mb:8.1f} MB  {os.path.basename(p)}")
        if mode == "apply":
            ok = to_recycle(p)
            if not ok:
                print(f"    !! 未能移入回收站: {p}")
    print(f"  小计 {len(items)} 项 / {total:.1f} MB")

    logs = plan_logs()
    ltotal = sum(mb for _k, _p, mb in logs)
    print("\n── 2) 日志（归档 + 清理一次性）──")
    stamp = time.strftime("%Y%m%d-%H%M%S")
    for kind, p, mb in logs:
        print(f"  {kind:14s} {mb:8.2f} MB  {os.path.basename(p)}")
        if mode == "apply":
            try:
                if kind == "归档构建日志":
                    os.rename(p, f"{p}.{stamp}")
                    print(f"    → 归档为 {os.path.basename(p)}.{stamp}")
                else:
                    to_recycle(p)
            except OSError as e:
                print(f"    !! {e}")
    print(f"  小计 {len(logs)} 项 / {ltotal:.2f} MB")

    print(f"\n总计可回收 ≈ {total:.1f} MB 构建产物 + {ltotal:.2f} MB 日志")
    if mode == "dry":
        print("\n[dry] 未改动任何文件。确认无误后跑 apply。")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "dry"))
