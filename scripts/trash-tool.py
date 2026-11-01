#!/usr/bin/env python3
"""把临时/探测残留移入 Windows 回收站（不硬删，可还原）。

背景：任务 #136「清理临时探测文件」明确要求「用回收站（不硬删）移动，避免误删源」。
Windows 没有 gio trash / trash-put，send2trash 未安装 → 直接用 shell32.SHFileOperationW
的 FOF_ALLOWUNDO 走系统回收站。

用法: python _probe_cleanup.py <路径> [<路径> ...]
"""
import ctypes
import ctypes.wintypes as w
import os
import sys

FO_DELETE = 0x0003
FOF_SILENT = 0x0004
FOF_NOCONFIRMATION = 0x0010
FOF_ALLOWUNDO = 0x0040
FOF_NOERRORUI = 0x0400


class SHFILEOPSTRUCTW(ctypes.Structure):
    _fields_ = [
        ("hwnd", w.HWND),
        ("wFunc", w.UINT),
        ("pFrom", w.LPCWSTR),
        ("pTo", w.LPCWSTR),
        ("fFlags", ctypes.c_uint32),
        ("fAnyOperationsAborted", w.BOOL),
        ("hNameMappings", ctypes.c_void_p),
        ("lpszProgressTitle", w.LPCWSTR),
    ]


def to_recycle_bin(path: str) -> tuple[bool, str]:
    p = os.path.abspath(path)
    if not os.path.exists(p):
        return True, "不存在，跳过"
    op = SHFILEOPSTRUCTW()
    op.hwnd = None
    op.wFunc = FO_DELETE
    op.pFrom = p + "\0\0"          # 双 nul 结尾
    op.pTo = None
    op.fFlags = FOF_ALLOWUNDO | FOF_NOCONFIRMATION | FOF_NOERRORUI | FOF_SILENT
    op.fAnyOperationsAborted = False
    op.hNameMappings = None
    op.lpszProgressTitle = None
    rc = ctypes.windll.shell32.SHFileOperationW(ctypes.byref(op))
    if rc != 0:
        return False, f"SHFileOperationW 返回 {rc}"
    if op.fAnyOperationsAborted:
        return False, "操作被中止"
    if os.path.exists(p):
        return False, "路径仍存在（回收站不可用？）"
    return True, "已入回收站"


def main(argv: list[str]) -> int:
    if not argv:
        print("用法: python _probe_cleanup.py <路径> [<路径> ...]")
        return 2
    bad = 0
    for t in argv:
        ok, msg = to_recycle_bin(t)
        print(f"  [{'OK ' if ok else 'ERR'}] {t} → {msg}")
        if not ok:
            bad += 1
    print(f"\n完成：{len(argv) - bad}/{len(argv)} 项已入回收站（可从回收站还原）")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
