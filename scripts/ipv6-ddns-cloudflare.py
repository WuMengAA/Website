#!/usr/bin/env python3
"""
ipv6-ddns-cloudflare.py — 把本机 WLAN 的「稳定公网 IPv6」同步到 Cloudflare 的 AAAA 记录。
用途：电信 IPv6 前缀可能随重拨变化；用这个定时跑，域名始终指向本机 IPv6，实现 IPv6 直连开站。

配置（改下方常量，或设同名环境变量）：
  CF_API_TOKEN : Cloudflare API Token（需 Zone:DNS:Edit 权限）
  ZONE_ID      : 域名所在 Zone ID
  RECORD_NAME  : 要更新的主机名，如 home.example.com
  IFACE        : 网络接口别名，默认 WLAN

依赖：仅标准库 + 能出网。建议用 Windows 任务计划程序每 5~10 分钟跑一次。
"""
import os
import json
import sys
import subprocess
import urllib.request

CF_API_TOKEN = os.environ.get("CF_API_TOKEN", "REPLACE_ME")
ZONE_ID      = os.environ.get("ZONE_ID", "REPLACE_ME")
RECORD_NAME  = os.environ.get("DDNS_RECORD", "home.example.com")
IFACE       = os.environ.get("DDNS_IFACE", "WLAN")
API = "https://api.cloudflare.com/client/v4"


def get_stable_ipv6():
    """取 WLAN 上、全局作用域、稳定(Link/EUI64) 的 IPv6；排除临时(Random)与链路本地。"""
    ps = (f"Get-NetIPAddress -InterfaceAlias '{IFACE}' -AddressFamily IPv6 | "
          f"Where-Object {{$_.AddressState -eq 'Preferred' -and $_.PrefixOrigin -ne 'WellKnown' "
          f"-and $_.SuffixOrigin -ne 'Random'}} | Select-Object -ExpandProperty IPAddress")
    out = subprocess.run(["powershell", "-NoProfile", "-Command", ps],
                         capture_output=True, text=True).stdout.strip().splitlines()
    out = [l.strip() for l in out if l.strip()]
    return out[0] if out else None


def cf_get_record():
    req = urllib.request.Request(
        f"{API}/zones/{ZONE_ID}/dns_records?name={RECORD_NAME}&type=AAAA",
        headers={"Authorization": f"Bearer {CF_API_TOKEN}"})
    with urllib.request.urlopen(req, timeout=15) as r:
        data = json.load(r)
    for rec in data.get("result", []):
        if rec["type"] == "AAAA" and rec["name"] == RECORD_NAME:
            return rec
    return None


def cf_update(rec_id, ip):
    body = json.dumps({"content": ip, "type": "AAAA", "name": RECORD_NAME,
                       "ttl": 300, "proxied": False}).encode()
    req = urllib.request.Request(
        f"{API}/zones/{ZONE_ID}/dns_records/{rec_id}", data=body,
        headers={"Authorization": f"Bearer {CF_API_TOKEN}",
                 "Content-Type": "application/json"},
        method="PUT")
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.load(r)


def main():
    ip = get_stable_ipv6()
    if not ip:
        print("未发现稳定公网 IPv6，退出")
        sys.exit(1)
    print(f"本机稳定 IPv6: {ip}")

    if CF_API_TOKEN in ("REPLACE_ME", "") or ZONE_ID in ("REPLACE_ME", ""):
        print("尚未配置 CF_API_TOKEN / ZONE_ID，仅打印地址，不更新。")
        sys.exit(0)

    rec = cf_get_record()
    if not rec:
        print(f"Cloudflare 上找不到 {RECORD_NAME} 的 AAAA 记录，请先手动建一条空 AAAA。")
        sys.exit(1)
    if rec["content"] == ip:
        print(f"[无需更新] {RECORD_NAME} 已是 {ip}")
        return
    res = cf_update(rec["id"], ip)
    if res.get("success"):
        print(f"[已更新] {RECORD_NAME} -> {ip}")
    else:
        print("[失败]", res.get("errors"))
        sys.exit(1)


if __name__ == "__main__":
    main()
