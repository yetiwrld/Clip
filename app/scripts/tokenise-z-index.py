"""Replace raw z-index integers with the stacking tokens."""
import re
import pathlib

CSS = pathlib.Path('/home/user/Clip/app/src/renderer/styles/global.css')
source = CSS.read_text()

MAP = {
    '.camera-safe-zone': 'raised',
    '.timeline-item-body': 'raised',
    '.source-filmstrip': 'base',
    '.source-track-clip .timeline-wave-canvas': 'raised',
    '.timeline-caption-content, .timeline-text-content': 'raised',
    '.source-clip-title, .source-track-clip small': 'clip',
    '.timeline-caption-content:focus-visible, .timeline-text-content:focus-visible': 'clip',
    '.timeline-trim': 'marker',
    '.source-cut-region': 'marker',
    '.caption-trim-handle, .text-trim-handle': 'marker',
    '.timeline-tracking-marker': 'marker',
    '.timeline-keyframe-marker': 'marker',
    '.inspector-mobile-heading': 'marker',
    '.multi-track-drop-line': 'selected',
    '.multi-track-item.selected': 'selected',
    '.source-track-clip.selected': 'selected',
    '.source-trim-handle': 'selected',
    '.timeline-handle': 'handle',
    '.multi-track-cursor': 'handle',
    '.multi-track-item:focus-within': 'handle',
    '.timeline-caption-block.selected': 'handle',
    '.source-cut-handle': 'handle',
    '.multi-track-label': 'active',
    '.timeline-tracking-marker.selected': 'drag',
    '.timeline-keyframe-marker.selected': 'drag',
    '.multi-track-cursor.hovering': 'drag',
    '.multi-track-ruler': 'sticky',
    '.timeline-trim:focus-visible, .source-trim-handle:focus-visible': 'sticky',
    '.track-tools button:focus-visible, .multi-track-ruler-body button:focus-visible': 'top',
    '.camera-frame-gizmo': 'camera-frame',
    '.subject-select-layer': 'subject-layer',
    '.subject-selection-box': 'selection-box',
    '.editor-preview-tools': 'preview-tools',
    '.editor-tool-panel': 'panel',
    '.editor-inspector-backdrop': 'overlay',
    '.editor-body > .editor-inspector': 'inspector',
    '.menu': 'popover',
    '.timeline-add-track-options': 'popover',
    '.editor-stage:fullscreen': 'fullscreen',
    '.modal-backdrop': 'modal',
    '.toasts': 'toast',
}

hits = 0
missed = set()
EDITS = []


def replace_in(node):
    global hits
    token = MAP.get(node.selector)
    if token:
        body = source[node.body_start:node.body_end]
        new_body, n = re.subn(r'z-index:\s*-?\d+', 'z-index: var(--z-%s)' % token, body)
        if n:
            node.replace = new_body
            hits += n
            EDITS.append((node.body_start, node.body_end, new_body))


class Node:
    pass


def parse(text, i=0, stop=False, parent=None):
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
        node.replace = None
        kids, k = parse(text, j + 1, True, node)
        node.children = kids
        node.body_end = k
        node.end = k + 1
        if not prelude.startswith('@'):
            replace_in(node)
        nodes.append(node)
        i = k + 1
    return nodes, i


nodes, _ = parse(source)

out = source
for start, end, repl in sorted(EDITS, key=lambda e: e[0], reverse=True):
    out = out[:start] + repl + out[end:]

root_zone = out[out.index(':root'):out.index('\n}', out.index(':root'))]
rest = out.replace(root_zone, '')
remaining = re.findall(r'z-index:\s*-?\d+', rest)

CSS.write_text(out)
print('z-index declarations tokenised: %d' % hits)
print('raw z-index left outside :root: %s' % (remaining or 'none'))
