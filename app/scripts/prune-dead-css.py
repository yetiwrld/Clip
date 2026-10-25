"""Remove stylesheet rules that can never match.

A class is 'dead' when no .tsx/.ts file mentions it. Rules whose every class
is dead are unreachable, so they are removed; in a selector list only the dead
selectors are dropped and the live ones keep the shared body.
"""
import re
import sys
import pathlib

ROOT = pathlib.Path('/home/user/Clip/app/src/renderer')
CSS = ROOT / 'styles' / 'global.css'

source = CSS.read_text()

# ---------------------------------------------------------------- dead classes
def strip_comments(text):
    return re.sub(r'/\*.*?\*/', '', text, flags=re.S)

classes = set(re.findall(r'\.([a-zA-Z][\w-]*)', strip_comments(source)))
code = '\n'.join(p.read_text() for p in ROOT.rglob('*.tsx'))
code += '\n' + '\n'.join(p.read_text() for p in ROOT.rglob('*.ts'))

# Classes assembled from a prefix plus a suffix (e.g. camera-frame-handle-nw).
DYNAMIC_PREFIXES = ('camera-frame-handle-',)

import re as _re

def used(name):
    return _re.search(r'(?<![\w-])' + _re.escape(name) + r'(?![\w-])', code) is not None

dead = set()
for name in classes:
    if used(name):
        continue
    if any(name.startswith(p) for p in DYNAMIC_PREFIXES):
        continue
    dead.add(name)

# ---------------------------------------------------------------- parse
class Node:
    __slots__ = ('kind', 'selector', 'start', 'body_start', 'body_end', 'end', 'children')

def parse(text, i=0, stop_at_brace=False):
    """Return (nodes, index). Nodes are ('rule'|'at', selector, ...)."""
    nodes = []
    n = len(text)
    while i < n:
        ch = text[i]
        if ch == '}':
            if stop_at_brace:
                return nodes, i
            i += 1
            continue
        if text.startswith('/*', i):
            j = text.find('*/', i + 2)
            i = n if j < 0 else j + 2
            continue
        if ch in ' \t\r\n':
            i += 1
            continue
        # read prelude up to '{' or ';'
        j = i
        while j < n and text[j] not in '{;':
            j += 1
        if j >= n:
            break
        prelude = text[i:j].strip()
        if text[j] == ';':
            i = j + 1  # @import / @charset
            continue
        node = Node()
        node.selector = prelude
        node.start = i
        node.body_start = j + 1
        nodes_inner, k = parse(text, j + 1, stop_at_brace=True)
        node.children = nodes_inner
        node.body_end = k
        node.end = k + 1
        node.kind = 'at' if prelude.startswith('@') else 'rule'
        nodes.append(node)
        i = k + 1
    return nodes, i

nodes, _ = parse(source)

def class_tokens(selector):
    return re.findall(r'\.([a-zA-Z][\w-]*)', selector)

def is_dead_selector(selector):
    tokens = class_tokens(selector)
    return bool(tokens) and all(t in dead for t in tokens)

def split_selector_list(selector):
    parts, depth, cur = [], 0, ''
    for ch in selector:
        if ch in '([':
            depth += 1
        elif ch in ')]':
            depth -= 1
        if ch == ',' and depth == 0:
            parts.append(cur)
            cur = ''
        else:
            cur += ch
    parts.append(cur)
    return [p.strip() for p in parts if p.strip()]

# ---------------------------------------------------------------- decide
edits = []   # (start, end, replacement)
removed_rules = 0
trimmed_lists = 0

def plan(node, in_at_rule):
    global removed_rules, trimmed_lists
    if node.kind == 'at':
        if node.selector.startswith('@media') or node.selector.startswith('@supports'):
            inner_removed = False
            for child in node.children:
                if child.kind == 'rule':
                    plan(child, True)
            return
        return  # keyframes / font-face: leave alone
    sel = node.selector
    parts = split_selector_list(sel)
    live = [p for p in parts if not is_dead_selector(p)]
    if not live:
        edits.append((node.start, node.end, ''))
        removed_rules += 1
    elif len(live) != len(parts):
        body = source[node.body_start:node.body_end]
        edits.append((node.start, node.end, ', '.join(live) + ' {' + body + '}'))
        trimmed_lists += 1

for node in nodes:
    plan(node, False)

# remove @media blocks that ended up empty
def at_nodes():
    return [n for n in nodes if n.kind == 'at' and n.selector.startswith('@media')]

out = source
for start, end, repl in sorted(edits, key=lambda e: e[0], reverse=True):
    out = out[:start] + repl + out[end:]

# tidy: drop empty media blocks and repeated blank lines
out = re.sub(r'@media[^{]*\{\s*\}\n?', '', out)
out = re.sub(r'\n{3,}', '\n\n', out)

# ---------------------------------------------------------------- verify
if out.count('{') != out.count('}'):
    sys.exit('brace mismatch after edit: %d { vs %d }' % (out.count('{'), out.count('}')))

CSS.write_text(out)
print('dead classes: %d' % len(dead))
print('rules removed: %d' % removed_rules)
print('selector lists trimmed: %d' % trimmed_lists)
print('lines: %d -> %d' % (source.count('\n'), out.count('\n')))
