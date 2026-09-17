# Starts the FastAPI backend on 127.0.0.1:8001 as a detached process.
#
# Guard behaviour: Windows allows MULTIPLE processes to bind the same port, so
# a "reload" start can leave an old zombie listener that keeps answering with
# stale code (HTTP 500). Before starting, this script checks the port AND for
# leftover uvicorn processes, cleans them up if the port is not actually
# serving a healthy backend, then starts exactly one server.
#
# Usage: powershell -ExecutionPolicy Bypass -File start_backend.ps1
# Stop:  powershell -ExecutionPolicy Bypass -File stop_backend.ps1
#
# Options:
#   -Port <int>        Port to bind (default 8001)
#   -Reload            Enable uvicorn --reload (auto-restart on code changes)
#   -Force             Always stop existing listeners/uvicorn before starting

param(
    [int]$Port = 8001,
    [switch]$Reload,
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$backendDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$logOut = Join-Path $backendDir "uvicorn_out.log"
$logErr = Join-Path $backendDir "uvicorn_err.log"
$baseUrl = "http://127.0.0.1:$Port"

function Get-PortListeners {
    param([int]$LocalPort)
    @(Get-NetTCPConnection -State Listen -LocalPort $LocalPort -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique)
}

function Get-StaleUvicornProcesses {
    Get-CimInstance Win32_Process -Filter "Name='python.exe'" -ErrorAction SilentlyContinue |
        Where-Object {
            $_.CommandLine -and (
                $_.CommandLine -match "uvicorn\s+app\.main:app" -or
                $_.CommandLine -match "multiprocessing-fork"
            )
        }
}

function Get-UvicornServers {
    # Server *parents* only (the reload child does not contain 'uvicorn app.main:app').
    Get-CimInstance Win32_Process -Filter "Name='python.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -and $_.CommandLine -match "uvicorn\s+app\.main:app" }
}

function Test-BackendHealthy {
    param([string]$Url)
    try {
        $r = Invoke-WebRequest -Uri "$Url/health" -UseBasicParsing -TimeoutSec 3
        return ($r.StatusCode -eq 200)
    } catch {
        return $false
    }
}

$listeners = Get-PortListeners -LocalPort $Port
$staleProcs = @(Get-StaleUvicornProcesses)
$servers = @(Get-UvicornServers)

# --- Guard: is something already running correctly? ------------------------
# IMPORTANT: multiple '--reload' servers can coexist on the same port. /health
# may still answer (served by whichever won), so a healthy response alone is
# NOT proof that we are clean. Always treat >1 server as a duplicate to purge.
if (-not $Force -and ($listeners.Count -gt 0 -or $servers.Count -gt 1)) {
    if ($servers.Count -gt 1) {
        $dupIds = ($servers | ForEach-Object { $_.ProcessId }) -join ', '
        Write-Output "Detected $($servers.Count) uvicorn servers on port $Port (PIDs $dupIds). Cleaning up duplicates and restarting one."
    } elseif (Test-BackendHealthy -Url $baseUrl) {
        Write-Output "Backend already healthy on $baseUrl (PID $($listeners -join ', ')). Nothing to do."
        exit 0
    } else {
        Write-Output "Port $Port is held by PID $($listeners -join ', ') but /health is NOT responding. Treating as stale and restarting."
    }
}

# --- Clean any stale listeners / orphaned processes ------------------------
if ($Force -or $listeners.Count -gt 0 -or $staleProcs.Count -gt 0 -or $servers.Count -gt 1) {
    $toStop = @($listeners)
    foreach ($p in $staleProcs) { $toStop += $p.ProcessId }
    $toStop = $toStop | Where-Object { $_ } | Select-Object -Unique
    foreach ($procId in $toStop) {
        try {
            Stop-Process -Id $procId -Force -ErrorAction Stop
            Write-Output "  Stopped stale PID $procId"
        } catch {
            Write-Output "  Could not stop PID $procId : $($_.Exception.Message)"
        }
    }
    Start-Sleep -Seconds 1

    $stillListening = Get-PortListeners -LocalPort $Port
    if ($stillListening.Count -gt 0) {
        Write-Output "ERROR: port $Port still held by PID $($stillListening -join ', ') after cleanup. Aborting."
        exit 1
    }
}

# --- Start exactly one server ---------------------------------------------
$uvicornArgs = @("-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "$Port")
if ($Reload) { $uvicornArgs += "--reload" }

$proc = Start-Process -FilePath "python" `
    -ArgumentList $uvicornArgs `
    -WorkingDirectory $backendDir `
    -RedirectStandardOutput $logOut `
    -RedirectStandardError $logErr `
    -WindowStyle Hidden `
    -PassThru

Write-Output "Started backend PID $($proc.Id) on $baseUrl (reload=$([bool]$Reload)). Logs: uvicorn_out.log / uvicorn_err.log"

# --- Wait for health --------------------------------------------------------
for ($i = 0; $i -lt 45; $i++) {
    Start-Sleep -Seconds 1
    if (Test-BackendHealthy -Url $baseUrl) {
        $confirm = @(Get-PortListeners -LocalPort $Port)
        Write-Output "Backend healthy on $baseUrl. Listening PID(s): $($confirm -join ', ')"
        if ($confirm.Count -gt 1) {
            Write-Output "WARNING: more than one process is bound to $Port ($($confirm -join ', '))."
        }
        exit 0
    }
}

Write-Output "Backend did not become healthy in time. Check uvicorn_err.log."
exit 1
