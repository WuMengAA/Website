#!/usr/bin/env python3
"""从 dsh-vault 取 github-pat → 验证 → 写回站点 .env 的 GITHUB_TOKEN。

安全约定：
  · 明文 token 只在本进程内存中流转，**不打印、不落盘**（.env 是它唯一的落点）。
  · 输出只报告长度/前缀/接口返回的登录名与权限位。

用法: python scripts/vault-sync-github.py [--dry]
"""
import base64
import json
import re
import sys
import urllib.error
import urllib.request

VAULT_DIR = r"C:/Users/Administrator/.dsh/vault"
VAULT_PY_DIR = r"D:/Stelarith/Stelarith-xingjikong-qt/Stelarith-cloud/scripts"
ENV_FILE = r"D:/Stelarith/Stelarith-website/stelarith/.env"
API = "https://api-github-com-gh.245959623.xyz"


def load_secret(name: str) -> str:
    sys.path.insert(0, VAULT_PY_DIR)
    import vault  # 复用官方实现，避免自己写 crypto 出错

    key = open(f"{VAULT_DIR}/master.key", "rb").read()
    db = json.load(open(f"{VAULT_DIR}/vault.json", encoding="utf-8"))
    blob = db["entries"][name]
    return vault.decrypt_value(key, blob).decode("utf-8")


def api_get(path: str, token: str):
    req = urllib.request.Request(API + path, headers={
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "User-Agent": "stelarith-vault-sync",
    })
    with urllib.request.urlopen(req, timeout=25) as r:
        return r.status, json.loads(r.read().decode())


def main() -> int:
    dry = "--dry" in sys.argv

    tok = load_secret("github-pat")
    print(f"vault 取到 github-pat：len={len(tok)} 前缀={tok[:10]}…")

    print("\n── 验证 token ──")
    try:
        st, me = api_get("/user", tok)
        print(f"  /user  HTTP {st}  login={me.get('login')}  type={me.get('type')}")
    except urllib.error.HTTPError as e:
        print(f"  /user  HTTP {e.code} —— token 无效：{e.read().decode()[:160]}")
        return 1
    except Exception as e:
        print(f"  /user  请求失败：{e}")
        return 1

    try:
        st, repo = api_get("/repos/WuMengAA/Website", tok)
        perms = repo.get("permissions") or {}
        print(f"  /repos/WuMengAA/Website  HTTP {st}  private={repo.get('private')}")
        print(f"  permissions: {perms}")
        can_push = bool(perms.get("push"))
        print(f"  → 可推送: {'是' if can_push else '否（缺 contents:write）'}")
    except urllib.error.HTTPError as e:
        print(f"  /repos HTTP {e.code}：{e.read().decode()[:160]}")
        can_push = False

    # 写回 .env（只替换 GITHUB_TOKEN 那一行的值）
    raw = open(ENV_FILE, "rb").read()
    txt = raw.decode("utf-8")
    new_txt, n = re.subn(r"(?m)^GITHUB_TOKEN=.*$", "GITHUB_TOKEN=" + tok, txt)
    if n != 1:
        print(f"\n!! .env 中 GITHUB_TOKEN 行数异常（{n}），中止，未写入。")
        return 1
    if new_txt == txt:
        print("\n.env 的 GITHUB_TOKEN 与 vault 一致，无需改动。")
        return 0 if can_push else 3
    if dry:
        print("\n[dry] .env 需要更新，未写入。")
        return 0 if can_push else 3
    open(ENV_FILE, "wb").write(new_txt.encode("utf-8"))
    print("\n✅ 已把 vault 中的 github-pat 写入 .env 的 GITHUB_TOKEN（其余行未动）")
    print("   注意：需要重启 StelarithServer 才会被进程读到（scripts/site-restart.py）")
    return 0 if can_push else 3


if __name__ == "__main__":
    sys.exit(main())
