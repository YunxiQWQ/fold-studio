$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$version = (Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
$name = "fold-studio-v$version"
$source = Join-Path $root '折间.html'
if (-not (Test-Path -LiteralPath $source)) { throw 'Run npm run build first.' }
if (-not ((Get-Content -LiteralPath $source -Raw) -match [regex]::Escape("v$version"))) { throw 'Offline HTML version is stale; run npm run build first.' }

$target = Join-Path $root "artifacts/releases/v$version"
$stage = Join-Path $target 'package'
New-Item -ItemType Directory -Path $stage -Force | Out-Null
$offline = Join-Path $target "$name.html"
Copy-Item -LiteralPath $source -Destination $offline -Force
Copy-Item -LiteralPath $source -Destination (Join-Path $stage "$name.html") -Force

$modelCount = node --input-type=module -e "import {BOX_TYPES} from './src/geometry.js'; console.log(Object.keys(BOX_TYPES).length)"
if ($LASTEXITCODE -ne 0) { throw 'Could not count structures.' }
$instructions = @"
折间 Fold Studio v$version

使用方法 / Quick start
解压后用 Edge 或 Chrome 双击打开 $name.html。
Extract the ZIP, then open $name.html with Edge or Chrome.
无需安装、联网或启动服务器。No install, network or server required.
$modelCount 款包装结构与瓶罐容器，支持平面设计、三维折叠、SVG 与 GLB 导出。
$modelCount packaging templates and containers with flat artwork, 3D folding and exports.

项目 / Project: https://github.com/YunxiQWQ/fold-studio
许可 / Licenses: LICENSE, THIRD_PARTY_NOTICES.md
贡献者 / Contributors: CONTRIBUTORS.md
更新记录 / Changes: CHANGELOG.md
"@
[System.IO.File]::WriteAllText((Join-Path $stage 'README.txt'), $instructions, (New-Object System.Text.UTF8Encoding($false)))
@('LICENSE', 'THIRD_PARTY_NOTICES.md', 'CHANGELOG.md', 'CONTRIBUTORS.md', "RELEASE_NOTES_v$version.md") | ForEach-Object {
    Copy-Item -LiteralPath (Join-Path $root $_) -Destination (Join-Path $stage $_) -Force
}

$archive = Join-Path $target "$name.zip"
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $archive -CompressionLevel Optimal -Force
$checksums = @($offline, $archive) | ForEach-Object {
    $hash = (Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash.ToLowerInvariant()
    "$hash  $(Split-Path -Leaf $_)"
}
[System.IO.File]::WriteAllText((Join-Path $target 'SHA256SUMS.txt'), (($checksums -join "`n") + "`n"), (New-Object System.Text.UTF8Encoding($false)))
Get-ChildItem -LiteralPath $target -File | Select-Object Name, Length
