Param(
  [string]$DumpFile = "backup.dump"
)

if (-not $env:VERCEL_DB_URL) {
  Write-Error "Please set VERCEL_DB_URL environment variable to your Vercel Postgres connection string (postgres://user:pass@host:port/dbname)"
  exit 1
}

if (-not (Test-Path $DumpFile)) {
  Write-Error "Dump file not found: $DumpFile"
  exit 1
}

Write-Host "Importing $DumpFile into Vercel Postgres..."

# Restore using pg_restore. --clean drops objects before recreating them to avoid conflicts
& pg_restore --verbose --clean --no-owner --role=postgres --dbname=$env:VERCEL_DB_URL $DumpFile

if ($LASTEXITCODE -ne 0) {
  Write-Error "pg_restore failed with exit code $LASTEXITCODE"
  exit $LASTEXITCODE
}

Write-Host "Import complete"