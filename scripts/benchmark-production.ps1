function Measure-Endpoint {
    param(
        [string]$Url,
        [string]$Method = "GET",
        [string]$Body = $null
    )
    # Cold request
    $coldTime = (Measure-Command {
        if ($Method -eq "POST") {
            try { 
                Invoke-WebRequest -Uri $Url -Method POST -Body $Body -ContentType "application/json" -UseBasicParsing | Out-Null
            } catch { 
                # Catch expected 400 validation error
            }
        } else {
            Invoke-WebRequest -Uri $Url -UseBasicParsing | Out-Null
        }
    }).TotalMilliseconds

    # Warm requests (5 runs)
    $warmTimes = @()
    for ($i = 0; $i -lt 5; $i++) {
        $t = (Measure-Command {
            if ($Method -eq "POST") {
                try { 
                    Invoke-WebRequest -Uri $Url -Method POST -Body $Body -ContentType "application/json" -UseBasicParsing | Out-Null
                } catch { 
                    # Catch expected 400 validation error
                }
            } else {
                Invoke-WebRequest -Uri $Url -UseBasicParsing | Out-Null
            }
        }).TotalMilliseconds
        $warmTimes += $t
    }

    $sorted = $warmTimes | Sort-Object
    $median = $sorted[2]
    $min = $sorted[0]
    $max = $sorted[4]
    $avg = ($warmTimes | Measure-Object -Average).Average

    [PSCustomObject]@{
        Endpoint = $Url.Replace("http://localhost:3000", "")
        Cold_ms = [math]::Round($coldTime, 2)
        Median_ms = [math]::Round($median, 2)
        Min_ms = [math]::Round($min, 2)
        Max_ms = [math]::Round($max, 2)
        Avg_ms = [math]::Round($avg, 2)
    }
}

$r1 = Measure-Endpoint -Url "http://localhost:3000/r/papi-dhaba"
$r2 = Measure-Endpoint -Url "http://localhost:3000/api/r/papi-dhaba"
$r3 = Measure-Endpoint -Url "http://localhost:3000/api/r/papi-dhaba/bill?table=1"
$r4 = Measure-Endpoint -Url "http://localhost:3000/api/r/papi-dhaba/orders" -Method "POST" -Body "{}"
$r5 = Measure-Endpoint -Url "http://localhost:3000/login"
$r6 = Measure-Endpoint -Url "http://localhost:3000/terms"

$results = @($r1, $r2, $r3, $r4, $r5, $r6)
$results | Format-Table -AutoSize
