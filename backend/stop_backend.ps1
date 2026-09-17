# Stops the FastAPI backend and any duplicate/zombie uvicorn processes.
#
# Why this exists: Windows lets two processes bind 127.0.0.1:8001 at the same
# time. A stale listener keeps serving old code (returning HTTP 500) while a
# new server also starts, and requests are answered by the zombie. This script
# removes EVERY listener on the backend ports plus any orphaned uvicorn reload
# children, then verifies the ports are actually free.
#
# Usage: powershell -ExecutionPolicy Bypass -File stop_backend.ps1

$ErrorActionPreference = "Continue"

# Backend ports: 8001 is the primary API, 8002 was used by a diagnostic run.
$ports = @(8001, 8002)

function Get-PortListeners {
    param([int[]]$Ports)
    $ids = @()
    foreach ($p in $Ports) {
        $conns = Get-NetTCPConnection -State Listen -LocalPort $p -ErrorAction SilentlyContinue
        if ($conns) { $ids += $conns.OwningProcess }
    }
    return $ids | Where-Object { $_ } | Select-Object -Unique
}

function Get-StaleUvicornProcesses {
    # Matches the uvicorn server command line and its reload child
    # (which appears as "... multiprocessing.spawn ... multiprocessing-fork").
    Get-CimInstance Win32_Process -Filter "Name='python.exe'" -ErrorAction SilentlyContinue |
        Where-Object {
            $_.CommandLine -and (
                $_.CommandLine -match "uvicorn\s+app\.main:app" -or
                $_.CommandLine -match "multiprocessing-fork"
            )
        }
}

# --- Pass 1: whatever owns the backend ports -------------------------------
$listenerIds = Get-PortListeners -Ports $ports
if ($listenerIds.Count -gt 0) {
    Write-Output ("Port listeners found on $($ports -join ', ') : PID $($listenerIds -join ', ')")
    foreach ($procId in $listenerIds) {
        try {
            Stop-Process -Id $procId -Force -ErrorAction Stop
            Write-Output "  Stopped PID $procId"
        } catch {
            Write-Output "  Could not stop PID $procId : $($_.Exception.Message)"
        }
    }
} else {
    Write-Output "No listeners found on ports $($ports -join ', ')."
}

# --- Pass 2: orphaned uvicorn / reload children ----------------------------
Start-Sleep -Milliseconds 750
$staleProcs = Get-StaleUvicornProcesses
foreach ($proc in $staleProcs) {
    try {
        Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop
        Write-Output "  Stopped orphan uvicorn PID $($proc.ProcessId)"
    } catch {
        Write-Output "  Could not stop orphan PID $($proc.ProcessId) : $($_.Exception.Message)"
    }
}

# --- Verify ----------------------------------------------------------------
Start-Sleep -Seconds 1
$remainingPorts = Get-PortListeners -Ports $ports
$remainingProcs = Get-StaleUvicornProcesses

if (($remainingPorts.Count -eq 0) -and (@($remainingProcs).Count -eq 0)) {
    Write-Output "Verified: ports $($ports -join ', ') are free and no uvicorn processes remain."
    exit 0
}

if ($remainingPorts.Count -gt 0) {
    Write-Output "WARNING: still listening on $($ports -join ', ') : PID $($remainingPorts -join ', ')"
}
if (@($remainingProcs).Count -gt 0) {
    Write-Output "WARNING: uvicorn processes still running: PID $((@($remainingProcs) | ForEach-Object { $_.ProcessId }) -join ', ')"
}
exit 1
