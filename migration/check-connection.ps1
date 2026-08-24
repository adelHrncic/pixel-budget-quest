if (-not $env:VERCEL_DB_URL) {
  Write-Error "Please set VERCEL_DB_URL environment variable to your Vercel Postgres connection string"
  exit 1
}

Write-Host "Checking connection to Vercel Postgres..."
& psql "$env:VERCEL_DB_URL" -c "SELECT current_database(), current_user, now();"

if ($LASTEXITCODE -ne 0) { Write-Error "psql failed with $LASTEXITCODE"; exit $LASTEXITCODE }
Write-Host "Connection OK"