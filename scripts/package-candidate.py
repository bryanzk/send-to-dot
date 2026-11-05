"""Build a deterministic source-only candidate, never a runtime backup."""
from pathlib import Path
import gzip, hashlib, io, tarfile, json

root = Path(__file__).resolve().parents[1]
allowed = {
    '': {'.mjs', '.py', '.json', '.md', '.txt', '.toml'},
    'scripts': {'.mjs', '.py', '.sh'},
    'docs': {'.md', '.txt'},
    'web': {'.js', '.html', '.css', '.webmanifest', '.png', '.svg'},
    'shortcuts': {'.md', '.py', '.json', '.shortcut'},
    'ios': {'.swift', '.plist', '.entitlements', '.md', '.pbxproj'},
    'cloud': {'.mjs', '.toml'},
}
special = {'.gitignore', '.env.example', '.dev.vars.example', 'LICENSE'}
blocked = {'.secrets', 'state', 'node_modules', '.venv', '__pycache__', '.git'}
paths = []
for path in sorted(root.rglob('*')):
    rel = path.relative_to(root)
    if any(part in blocked for part in rel.parts):
        continue
    if path.is_symlink():
        raise SystemExit('Unexpected source symlink: ' + str(rel))
    if not path.is_file() or path.name == 'SOURCE_SHA256.txt':
        continue
    section = rel.parts[0] if len(rel.parts) > 1 else ''
    if path.name in {'approved.config.json', 'package-candidate.tar.gz'}:
        continue
    if str(rel) in special or path.suffix in allowed.get(section, set()):
        paths.append(path)
checksums = ''.join(hashlib.sha256(p.read_bytes()).hexdigest() + '  ' + str(p.relative_to(root)) + '\n' for p in paths)
(root / 'SOURCE_SHA256.txt').write_text(checksums)
paths.append(root / 'SOURCE_SHA256.txt')
version = json.loads((root / 'package.json').read_text())['version']
output = root.parent / f'send-to-dot-{version}-source-candidate.tar.gz'
with output.open('wb') as raw, gzip.GzipFile(filename='', fileobj=raw, mode='wb', mtime=0) as compressed, tarfile.open(fileobj=compressed, mode='w') as archive:
    for path in sorted(paths):
        data = path.read_bytes()
        item = tarfile.TarInfo('send-to-dot/' + str(path.relative_to(root)))
        item.size = len(data)
        item.mode = 0o644
        item.mtime = item.uid = item.gid = 0
        archive.addfile(item, io.BytesIO(data))
print(str(output))
print('files=' + str(len(paths)))
print('sha256=' + hashlib.sha256(output.read_bytes()).hexdigest())
