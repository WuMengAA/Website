#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Gate endfield-kit.css behind the `html.theme-endfield` skin class.

endfield-kit.css is imported (unconditionally) in 13 routes, so its `.ex-*` rules
paint the Endfield skin over the site's default Claude (classic) look. We prefix
every selector with `html.theme-endfield ` so the Endfield skin only applies when
the opt-in skin class is present on <html>. `:root` becomes `html.theme-endfield`
and a bare `.dark` becomes `html.theme-endfield.dark` (same element), preserving
the dark-variant cascade.

Design: a single tokenizer splits the file into a flat list of statements
(comments / at-rule statements / blocks). Blocks are rendered recursively:
  - grouping at-rules (@media @supports @container @layer @document): recurse
  - other at-rules (@keyframes @property @font-face @view-transition ...): verbatim
  - style rules: prefix selector (commas split at depth 0)
"""
import sys
import io

GROUPING = {"@media", "@supports", "@container", "@layer", "@document"}


def split_top(sel):
    """Split a selector list on commas that are NOT inside () or []."""
    parts, depth, cur = [], 0, ""
    for ch in sel:
        if ch in "([":
            depth += 1
            cur += ch
        elif ch in ")]":
            depth -= 1
            cur += ch
        elif ch == "," and depth == 0:
            parts.append(cur)
            cur = ""
        else:
            cur += ch
    if cur.strip():
        parts.append(cur)
    return parts


def prefix_selector(raw):
    out = []
    for part in split_top(raw):
        p = part.strip()
        if not p:
            continue
        if p.startswith(":root"):
            out.append("html.theme-endfield" + p[5:])
        elif p.startswith(".dark"):
            out.append("html.theme-endfield" + p)
        else:
            out.append("html.theme-endfield " + p)
    return ",\n".join(out)


def tokenize(text):
    toks = []
    i, L = 0, len(text)
    while i < L:
        ch = text[i]
        if ch in " \t\r\n":
            i += 1
            continue
        if text[i : i + 2] == "/*":
            j = text.find("*/", i + 2)
            j = L if j == -1 else j + 2
            toks.append(("comment", text[i:j], None))
            i = j
            continue
        # read prelude until '{' or ';'
        j = i
        while j < L and text[j] not in "{;":
            j += 1
        prelude = text[i:j]
        if j < L and text[j] == ";":
            toks.append(("stmt", prelude.strip(), None))
            i = j + 1
            continue
        # block: text[j] == '{' -> find matching '}'
        depth, k = 1, j + 1
        while k < L and depth > 0:
            c = text[k]
            if c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
            k += 1
        toks.append(("block", prelude.strip(), text[j + 1 : k - 1]))
        i = k
    return toks


def render(toks):
    out = []
    for kind, prelude, body in toks:
        if kind == "comment":
            out.append(prelude)
        elif kind == "stmt":
            out.append(prelude + ";\n")
        elif prelude.startswith("@"):
            name = prelude.split(None, 1)[0]
            if name in GROUPING:
                out.append(prelude + " {\n")
                out.append(render(tokenize(body)))
                out.append("}\n")
            else:
                out.append(prelude + " {\n")
                out.append(body)
                out.append("}\n")
        else:
            out.append(prefix_selector(prelude) + " {\n")
            out.append(body)
            out.append("}\n")
    return "".join(out)


def check(toks, violations):
    """Validate the RENDERED output: every style-rule selector must be prefixed."""
    for kind, prelude, body in toks:
        if kind == "block" and prelude.startswith("@"):
            name = prelude.split(None, 1)[0]
            if name in GROUPING:
                check(tokenize(body), violations)
        elif kind == "block":
            for part in split_top(prelude):
                if part.strip() and not part.strip().startswith("html.theme-endfield"):
                    violations.append(part.strip())
    return violations


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else "src/routes/endfield-kit.css"
    with io.open(path, "r", encoding="utf-8") as f:
        src = f.read()
    toks = tokenize(src)
    result = render(toks)
    violations = check(tokenize(result), [])
    with io.open(path, "w", encoding="utf-8") as f:
        f.write(result)
    print(f"gated {path}: {len(result)} bytes written")
    if violations:
        print(f"WARNING: {len(violations)} ungated selectors leaked:")
        for v in violations[:40]:
            print("  - " + v)
        sys.exit(2)
    print("OK: all style-rule selectors are prefixed with html.theme-endfield")


if __name__ == "__main__":
    main()
