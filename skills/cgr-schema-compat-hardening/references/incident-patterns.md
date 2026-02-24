# Incident Patterns

## Pattern: Missing column in catalog table

Example:

`table cat_abogados has no column named nombre`

Observed production reality:

- `cat_abogados.iniciales`
- `cat_descriptores.termino`

Mitigation pattern:

- attempt primary column
- on missing-column SQL error, fallback to alternates
- log fallback path

## Mandatory remote checks

```bash
wrangler d1 execute cgr-dictamenes --remote --command "PRAGMA table_info(cat_abogados);"
wrangler d1 execute cgr-dictamenes --remote --command "SELECT sql FROM sqlite_master WHERE type='table' AND name='cat_abogados';"
```
