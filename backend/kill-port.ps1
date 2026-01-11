# Kill all processes using port 3001
Write-Host "Checking for processes using port 3001..." -ForegroundColor Yellow

$processes = netstat -ano | findstr :3001 | ForEach-Object {
    $line = $_.Trim()
    if ($line -match '\s+(\d+)$') {
        $matches[1]
    }
} | Select-Object -Unique

if ($processes) {
    Write-Host "Found processes using port 3001: $($processes -join ', ')" -ForegroundColor Red
    foreach ($pid in $processes) {
        try {
            $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
            if ($proc) {
                Write-Host "Killing process $pid ($($proc.ProcessName))..." -ForegroundColor Yellow
                Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
                Write-Host "Process $pid terminated" -ForegroundColor Green
            }
        } catch {
            Write-Host "Failed to kill process $pid" -ForegroundColor Red
        }
    }
    Write-Host "All processes using port 3001 have been terminated." -ForegroundColor Green
} else {
    Write-Host "No processes found using port 3001." -ForegroundColor Green
}
