"""Fold repeated rules for the same selector into one declaration block.

The stylesheet grew by appending override passes. Each pass re-stated a
selector instead of editing it, so `.editor-body` ended up declared eleven
times with three different paddings. This script keeps the winning value of
every property, writes the rule once at the position of its last occurrence,
and drops the earlier copies.

Safety: a group is skipped when another rule between the copies declares one
of the same properties on an element that shares a class with it. Those cases
fall back to the cascade and are reported instead of guessed at.
"""
import re
import sys
import pathlib

CSS = pathlib.Path('/home/user/Clip/app/src/renderer/styles/global.css')
DRY = '--dry' in sys.argv
source = CSS.read_text()


class Node:
    __slots__ = ('selector', 'body', 'start', 'body_start', 'body_end', 'end', 'kind', 'ctx', 'children')


def parse(text, i=0, stop=False, ctx=''):
    nodes = []
    n = len(text)
    while i < n:
        ch = text[i]
        if ch == '}':
            if stop:
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
        j = i
        while j < n and text[j] not in '{;':
            j += 1
        if j >= n:
            break
        prelude = text[i:j].strip()
        if text[j] == ';':
            i = j + 1
            continue
        node = Node()
        node.selector = prelude
        node.start = i
        node.body_start = j + 1
        node.kind = 'at' if prelude.startswith('@') else 'rule'
        node.ctx = ctx
        kids, k = parse(text, j + 1, True, prelude if prelude.startswith('@') else ctx)
        node.children = kids
        node.body_end = k
        node.end = k + 1
        node.body = text[node.body_start:node.body_end]
        nodes.append(node)
        i = k + 1
    return nodes, i


nodes, _ = parse(source)
flat = []  # (order, node)


def walk(items):
    for nd in items:
        flat.append(nd)
        if nd.kind == 'at':
            if nd.selector.startswith('@media') or nd.selector.startswith('@supports'):
                walk(nd.children)


walk(nodes)

def norm(sel):
    return ' '.join(sel.replace(',', ', ').split())

def decls(body):
    out = {}
    order = []
    for part in re.split(r';', body):
        if ':' not in part:
            continue
        prop, _, val = part.partition(':')
        prop = prop.strip().lower()
        val = ' '.join(val.split())
        if not prop:
            continue
        if prop not in out:
            order.append(prop)
        out[prop] = val
    return out, order

def class_tokens(sel):
    return set(re.findall(r'\.([a-zA-Z][\w-]*)', sel))


def specificity(sel):
    ids = len(re.findall(r'#[-\w]+', sel))
    cl = len(re.findall(r'\.[-\w]+|\[[^\]]*\]|:(?!:)[-\w]+', sel))
    el = len(re.findall(r'(?<![\w.#:\[])(?:[a-zA-Z][-\w]*)(?![\w(])', sel)) + len(re.findall(r'::[-\w]+', sel))
    return (ids, cl, el)


def spec_set(sel):
    parts = [p for p in sel.split(',') if p.strip()]
    return set(specificity(p) for p in parts) or {(0, 0, 0)}

groups = {}
for idx, nd in enumerate(flat):
    if nd.kind != 'rule':
        continue
    key = (nd.ctx, norm(nd.selector))
    groups.setdefault(key, []).append((idx, nd))

mergeable = []
skipped = []
for key, occ in groups.items():
    if len(occ) < 2:
        continue
    ctx, sel = key
    first, last = occ[0][0], occ[-1][0]
    props = set()
    for _, nd in occ:
        d, _ = decls(nd.body)
        props |= set(d)
    mine = class_tokens(sel)
    my_specs = spec_set(sel)
    blocked_by = None
    for nd in flat[first + 1:last]:
        if nd.kind != 'rule':
            continue
        if nd.ctx != ctx:
            continue            # different cascade context, not comparable
        other_sel = norm(nd.selector)
        if other_sel == sel:
            continue            # a copy in the same group
        other = class_tokens(other_sel)
        if not other:
            continue            # blanket element rules: leave the order alone
        if not (mine & other):
            continue
        if not (my_specs & spec_set(other_sel)):
            continue            # always wins or always loses: order is irrelevant
        d, _ = decls(nd.body)
        shared = props & set(d)
        if shared:
            blocked_by = (other_sel, sorted(shared))
            break
    if blocked_by:
        skipped.append((len(occ), sel, blocked_by))
    else:
        mergeable.append((len(occ), key, occ))

print('groups: %d mergeable, %d skipped' % (len(mergeable), len(skipped)))
for n, sel, why in sorted(skipped, reverse=True)[:12]:
    print('  skip x%d %s  (conflicts with %s on %s)' % (n, sel[:60], why[0][:40], ','.join(why[1])[:40]))

if DRY:
    for n, key, occ in sorted(mergeable, reverse=True)[:25]:
        print('  merge x%d %s' % (n, key[1][:70]))
    raise SystemExit(0)

edits = []
report = []
for n, key, occ in mergeable:
    merged, order = {}, []
    for _, nd in occ:
        d, o = decls(nd.body)
        for p in o:
            if p not in merged:
                order.append(p)
            merged[p] = d[p]
    body = ' '.join('%s: %s;' % (p, merged[p]) for p in order)
    last = occ[-1][1]
    # drop earlier copies (whole rule, selectors and all)
    for idx, nd in occ[:-1]:
        edits.append((nd.start, nd.end, ''))
    indent = '  ' if last.ctx else ''
    edits.append((last.start, last.end, indent + norm(last.selector) + ' { ' + body + ' }'))
    report.append((n, norm(last.selector)))

out = source
for start, end, repl in sorted(edits, key=lambda e: e[0], reverse=True):
    out = out[:start] + repl + out[end:]

out = re.sub(r'\n{3,}', '\n\n', out)
if out.count('{') != out.count('}'):
    raise SystemExit('brace mismatch: %d vs %d' % (out.count('{'), out.count('}')))

CSS.write_text(out)
print('merged: %d selectors; lines %d -> %d' % (len(report), source.count('\n'), out.count('\n')))
