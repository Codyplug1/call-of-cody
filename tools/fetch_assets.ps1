# Downloadt rechtenvrije (CC0) assets van Poly Haven voor de filmische render.
# Elke asset komt in een eigen map onder renders/assets/. Bestaande bestanden worden overgeslagen.
param([string]$Res = '2k')
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$h = @{ 'User-Agent' = 'blender-scene-script' }
$dest = Join-Path (Split-Path $PSScriptRoot -Parent) 'renders\assets'
New-Item -ItemType Directory -Force $dest | Out-Null

function Get-File($url, $path) {
  if ($path -match '\.\.') { throw "Onveilig pad: $path" }
  if (Test-Path $path) { return }
  New-Item -ItemType Directory -Force (Split-Path $path -Parent) | Out-Null
  Invoke-WebRequest $url -OutFile "$path.part" -Headers $h -UseBasicParsing
  Move-Item "$path.part" $path -Force
}

$models = 'grass_medium_01','fern_02','rock_moss_set_01','tree_stump_01','dead_tree_trunk','dry_branches_medium_01','moss_01',
          'wooden_military_crate','ammo_box','fir_sapling_medium','pine_sapling_medium','fir_tree_01','pine_tree_01'
foreach ($id in $models) {
  $f = Invoke-RestMethod "https://api.polyhaven.com/files/$id" -Headers $h
  $g = $f.gltf.$Res.gltf
  $dir = Join-Path $dest $id
  Get-File $g.url (Join-Path $dir "$id.gltf")
  foreach ($p in $g.include.PSObject.Properties) { Get-File $p.Value.url (Join-Path $dir ($p.Name -replace '/', '\')) }
  "OK model $id"
}

$f = Invoke-RestMethod "https://api.polyhaven.com/files/misty_pines" -Headers $h
Get-File $f.hdri.'4k'.hdr.url (Join-Path $dest 'misty_pines\misty_pines_4k.hdr')
"OK hdri misty_pines"

$f = Invoke-RestMethod "https://api.polyhaven.com/files/forest_ground_04" -Headers $h
foreach ($map in 'Diffuse','nor_gl','Rough','Displacement') {
  $fmts = $f.$map.$Res
  $fmt = @('jpg','png','exr') | Where-Object { $fmts.$_ } | Select-Object -First 1
  Get-File $fmts.$fmt.url (Join-Path $dest "forest_ground_04\$map.$fmt")
}
"OK texture forest_ground_04"
"KLAAR"
