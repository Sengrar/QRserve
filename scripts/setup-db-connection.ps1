# Safe local PostgreSQL setup and connection configuration script for QRServe
[CmdletBinding()]
param(
    [string]$Username = "postgres",
    [string]$HostName = "localhost",
    [int]$Port = 5432,
    [string]$Database = "qrserve"
)

Write-Host ""
Write-Host "=== QRServe Database Configuration ===" -ForegroundColor Cyan
Write-Host ("Configuring connection for user: " + $Username + " on " + $HostName + ":" + $Port + " to database: " + $Database)
Write-Host ""

# Securely prompt for password without echoing characters or logging
$securePwd = Read-Host -Prompt "Enter PostgreSQL password for user '$Username'" -AsSecureString

if ($null -eq $securePwd -or $securePwd.Length -eq 0) {
    Write-Error "Password cannot be empty."
    exit 1
}

$bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePwd)
$plainPwd = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
[System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)

# URL-encode password to handle special characters (@, #, /, :, %, $, etc.)
$encodedPwd = [System.Uri]::EscapeDataString($plainPwd)
$plainPwd = $null

$envFile = Join-Path $PSScriptRoot "..\.env"
if (-not (Test-Path $envFile)) {
    Write-Error ".env file does not exist at $envFile"
    exit 1
}

# Construct DATABASE_URL using explicit string concatenation to avoid any interpolation ambiguities
$dbUrl = "postgresql://" + $Username + ":" + $encodedPwd + "@" + $HostName + ":" + $Port + "/" + $Database + "?schema=public"

# Update .env safely line by line to avoid regex '$' escape issues with special characters in passwords
$lines = Get-Content -Path $envFile
$updated = $false
$newLines = @()

foreach ($line in $lines) {
    if ($line -match '^\s*DATABASE_URL\s*=') {
        $newLines += 'DATABASE_URL="' + $dbUrl + '"'
        $updated = $true
    } else {
        $newLines += $line
    }
}

if (-not $updated) {
    $newLines += 'DATABASE_URL="' + $dbUrl + '"'
}

Set-Content -Path $envFile -Value $newLines -Encoding utf8

Write-Host ""
Write-Host "[OK] .env updated with secure DATABASE_URL (password masked and URL-encoded)." -ForegroundColor Green
Write-Host ""

# Test connection via Prisma
Write-Host "Testing database connectivity and inspecting migration status..." -ForegroundColor Cyan
npx prisma migrate status
