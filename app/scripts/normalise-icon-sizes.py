"""Give every button icon the size that belongs to its role.

Roles agreed for the icon system:
    nav / tab            16
    toolbar, menu, btn   14
    small button text    12
    icon-only small btn  14
    inline / badge       12
    empty state          28

Only icons imported from lucide-react (plus the local Spinner) are touched,
and only inside <button> elements, so nothing else can drift.
"""
import re
import pathlib

ROOT = pathlib.Path('/home/user/Clip/app/src/renderer')
changed = []

for path in sorted(ROOT.rglob('*.tsx')):
    source = path.read_text()

    icons = set()
    for m in re.finditer(r"import\s*\{([^}]+)\}\s*from\s*'lucide-react'", source):
        for part in m.group(1).split(','):
            name = part.strip()
            if not name:
                continue
            name = name.split(' as ')[-1].strip()
            icons.add(name)
    icons.add('Spinner')

    def role(classes):
        if 'editor-tool-button' in classes or 'nav-item' in classes:
            return None              # navigation icons keep their own size
        if 'transport-play' in classes:
            return 16                # the main play control is deliberately larger
        if 'btn' not in classes:
            return None
        if re.search(r'\bsm\b', classes):
            return 12 if 'icon' not in classes else 14
        return 14

    def rewrite(match):
        block = match.group(0)
        if len(block) > 1200:
            return block
        cls = re.search(r'className=(?:"([^"]*)"|\{`([^`]*)`)', block)
        if not cls:
            return block
        want = role(cls.group(1) or cls.group(2) or '')
        if want is None:
            return block

        def size_of(m):
            name, size = m.group(1), int(m.group(2))
            if name not in icons or size == want:
                return m.group(0)
            changed.append((str(path).replace(str(ROOT) + '/', ''), name, size, want))
            return f'<{name} size={{{want}}}'

        return re.sub(r'<([A-Z][A-Za-z0-9]*) size=\{(\d+)\}', size_of, block)

    new = re.sub(r'<button\b(?:(?!</button>).)*?</button>', rewrite, source, flags=re.S)
    if new != source:
        path.write_text(new)

for row in changed:
    print('%-46s %-18s %2d -> %2d' % row)
print('%d icon sizes normalised' % len(changed))
