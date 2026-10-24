# Safe local password reset script for QRServe
[CmdletBinding()]
param(
    [string]$Email = "piyushverma282005@gmail.com"
)

Write-Host ""
Write-Host "=== QRServe Account Password Reset ===" -ForegroundColor Cyan
Write-Host ("Target Account: " + $Email)
Write-Host ""

# Securely prompt for password twice to prevent typos
$pwd1 = Read-Host -Prompt ("Enter new password for " + $Email + " (min 8 characters)") -AsSecureString

if ($null -eq $pwd1 -or $pwd1.Length -eq 0) {
    Write-Error "Password cannot be empty."
    exit 1
}

$pwd2 = Read-Host -Prompt "Confirm new password" -AsSecureString

$bstr1 = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($pwd1)
$plain1 = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr1)
[System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr1)

$bstr2 = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($pwd2)
$plain2 = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr2)
[System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr2)

if ($plain1 -ne $plain2) {
    $plain1 = $null
    $plain2 = $null
    Write-Error "Passwords do not match. Please try again."
    exit 1
}

if ($plain1.Length -lt 8) {
    $plain1 = $null
    $plain2 = $null
    Write-Error "Password must be at least 8 characters long."
    exit 1
}

$scriptPath = Join-Path $PSScriptRoot "reset-admin-password.ts"

# Pipe password securely via stdin to Node process so it never appears in command-line arguments or process trees
try {
    $plain1 | npx tsx $scriptPath $Email
} finally {
    # Immediately clear plain text and secure strings from memory
    $plain1 = $null
    $plain2 = $null
    $pwd1 = $null
    $pwd2 = $null
    [System.GC]::Collect()
}
