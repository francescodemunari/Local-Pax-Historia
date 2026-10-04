$ErrorActionPreference = 'Stop'
# The launcher passes an absolute entry-point path. Never stop an arbitrary
# process just because it owns the configured HTTP port.
$serverEntry = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\backend\server.js'))
$entryPattern = '(?i)^\s*(?:"[^"]+"|\S+)\s+(?:"' + [regex]::Escape($serverEntry) + '"|' + [regex]::Escape($serverEntry) + ')(?:\s|$)'
$serverProcesses = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
    Where-Object { $_.CommandLine -match $entryPattern })
if ($serverProcesses.Count -eq 0) {
    Write-Output 'No server launched for this project was found. A manually started server must be closed in its own terminal.'
    exit 0
}
foreach ($serverProcess in $serverProcesses) {
    # Recheck identity immediately before stopping in case the process exited.
    $currentProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($serverProcess.ProcessId)"
    if ($currentProcess -and $currentProcess.CreationDate -eq $serverProcess.CreationDate -and
        $currentProcess.Name -eq 'node.exe' -and $currentProcess.CommandLine -match $entryPattern) {
        Stop-Process -Id $currentProcess.ProcessId
        Write-Output "Stopped this project's server (process $($currentProcess.ProcessId))."
    }
}
