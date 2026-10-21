"""Package a built offline HTML into explicit, credential-free release assets.

Run npm run build first, then python scripts/package-release.py.
"""
import hashlib
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

root = Path(__file__).resolve().parent.parent
version = json.loads((root / 'package.json').read_text(encoding='utf-8'))['version']
html = (root / '折间.html').read_bytes()
if f'v{version}'.encode() not in html:
    raise SystemExit('Offline HTML version is stale; run npm run build first.')

target = root / 'artifacts' / 'releases' / f'v{version}'
target.mkdir(parents=True, exist_ok=True)
name = f'fold-studio-v{version}'
offline = target / f'{name}.html'
offline.write_bytes(html)
instructions = f'''折间 Fold Studio v{version}

使用方法 / Quick start
解压后用 Edge 或 Chrome 双击打开 {name}.html。
Extract the ZIP, then open {name}.html with Edge or Chrome.
无需安装、联网或启动服务器。No install, network or server required.
27 款包装结构与瓶罐容器，支持平面设计、三维折叠、SVG 与 GLB 导出。
27 packaging templates and containers with flat artwork, 3D folding and exports.

项目 / Project: https://github.com/YunxiQWQ/fold-studio
许可 / Licenses: LICENSE, THIRD_PARTY_NOTICES.md
更新记录 / Changes: CHANGELOG.md
'''
archive = target / f'{name}.zip'
with ZipFile(archive, 'w', compression=ZIP_DEFLATED, compresslevel=9) as bundle:
    bundle.write(offline, offline.name)
    bundle.writestr('README.txt', instructions)
    for filename in ['LICENSE', 'THIRD_PARTY_NOTICES.md', 'CHANGELOG.md']:
        bundle.write(root / filename, filename)
checksums = target / 'SHA256SUMS.txt'
checksums.write_text(''.join(
    f'{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.name}\n'
    for path in [offline, archive]
), encoding='utf-8')
for path in [offline, archive, checksums]:
    print(f'{path.name}: {path.stat().st_size} bytes')
