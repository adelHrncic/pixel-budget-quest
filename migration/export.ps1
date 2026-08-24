Param(
  [string]$Out = "backup.dump"
)

if (-not $env:SUPABASE_DB_URL) {
  Write-Error "Please set SUPABASE_DB_URL environment variable to your Supabase Postgres connection string (postgres://user:pass@host:port/dbname)"
  exit 1
}

Write-Host "Exporting Supabase Postgres to $Out..."

# Using pg_dump (custom format) to preserve schema and data
& pg_dump --format=custom --no-owner --file=$Out $env:SUPABASE_DB_URL

if ($LASTEXITCODE -ne 0) {
  Write-Error "pg_dump failed with exit code $LASTEXITCODE"
  exit $LASTEXITCODE
}

Write-Host "Export complete: $Out"