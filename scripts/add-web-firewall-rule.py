#!/usr/bin/env python3
# add-web-firewall-rule.py
# 在 Private/Public 防火墙配置文件下，添加允许入站 TCP 80/443 的规则。
# 用途：本地开站（IPv6 直连 + cloudflared 反向隧道）需要入站放行 80/443。
# 幂等：规则已存在则跳过；对应 profile 防火墙若关闭则开启。
# 运行需管理员权限：右键 PowerShell -> 以管理员身份运行 -> python add-web-firewall-rule.py
import subprocess

RULES = [
    ("Stelarith-Web-HTTP-In-TCP",  "80"),
    ("Stelarith-Web-HTTPS-In-TCP", "443"),
]
PROFILES = ("private", "public")


def run(cmd):
    # 指定 utf-8 + 忽略非法字节，避免 netsh 中文输出在某些代码页下抛 UnicodeDecodeError
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True,
                       encoding="utf-8", errors="ignore")
    return r.returncode, (r.stdout or "").strip(), (r.stderr or "").strip()


def main():
    for name, port in RULES:
        rc, out, err = run(f'netsh advfirewall firewall show rule name="{name}"')
        if rc == 0 and "No rules match" not in out:
            print(f"[跳过] 规则已存在: {name}")
            continue
        cmd = (f'netsh advfirewall firewall add rule name="{name}" '
               f'dir=in action=allow protocol=TCP localport={port} '
               f'profile=private,public '
               f'description="Local web hosting inbound (IPv6 direct + cloudflared)"')
        rc, out, err = run(cmd)
        print(f"[{'OK' if rc == 0 else 'FAIL'}] 添加 {name} (port {port}) rc={rc}")
        if rc != 0:
            print("   stderr:", err)

    for p in PROFILES:
        rc, out, err = run(f'netsh advfirewall show {p}profile state')
        if "ON" in out.upper():
            print(f"[OK] {p} 防火墙已开启")
        else:
            rc, out, err = run(f'netsh advfirewall set {p}profile state on')
            print(f"[{'OK' if rc == 0 else 'FAIL'}] 开启 {p} 防火墙 rc={rc} err={err}")

    print("\n=== 最终规则清单 ===")
    for name, _ in RULES:
        rc, out, err = run(f'netsh advfirewall firewall show rule name="{name}"')
        print(out)
        print("-" * 40)


if __name__ == "__main__":
    main()
