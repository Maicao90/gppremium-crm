param([string]$antes, [string]$depois)
function Ler($arq) {
  $h = @{}; $ordem = New-Object System.Collections.ArrayList; $cur = $null
  foreach ($l in (Get-Content $arq -Encoding utf8)) {
    if ($l -match '^# ') { $cur = $l; if (-not $h.ContainsKey($cur)) { [void]$ordem.Add($cur); $h[$cur] = '' } ; continue }
    if ($cur) { $h[$cur] += $l.Trim() + ' | ' }
  }
  return @($h, $ordem)
}
$a = Ler $antes; $d = Ler $depois
$iguais = 0; $dif = 0
foreach ($k in $a[1]) {
  $x = $a[0][$k]; $y = $d[0][$k]
  if ($x -eq $y) { $iguais++ } else { $dif++; "DIFERENTE $k`n  ANTES : $x`n  DEPOIS: $y" }
}
"iguais=$iguais diferentes=$dif"
