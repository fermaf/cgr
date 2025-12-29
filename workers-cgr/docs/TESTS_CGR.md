# Tests CGR (manuales)

## 1) Crawl por rango (sin filtros)
```bash
curl -X POST https://workers-cgr.abogado.workers.dev/internal/crawl-range \
  -H "content-type: application/json" \
  -H "x-import-token: <IMPORT_TOKEN>" \
  -d '{"from":"2025-12-01","to":"2025-12-31","limit":50,"enqueue":false,"maxPages":5}'
```

## 2) Crawl con criterio (Genera Jurisprudencia)
```bash
curl -X POST https://workers-cgr.abogado.workers.dev/internal/crawl-range \
  -H "content-type: application/json" \
  -H "x-import-token: <IMPORT_TOKEN>" \
  -d '{"from":"2025-01-01","to":"2025-12-31","limit":20,"enqueue":false,"options":[{"type":"category","field":"criterio","value":"Genera Jurisprudencia"}]}'
```

## 3) Crawl por N dictamen
```bash
curl -X POST https://workers-cgr.abogado.workers.dev/internal/crawl-range \
  -H "content-type: application/json" \
  -H "x-import-token: <IMPORT_TOKEN>" \
  -d '{"from":"2025-01-01","to":"2025-12-31","limit":5,"enqueue":false,"options":[{"type":"force_obj","field":"n_dictamen","value":"2828"}]}'
```

## 3.1) Crawl por ID dictamen (sin rango)
```bash
curl -X POST https://workers-cgr.abogado.workers.dev/internal/crawl-range \
  -H "content-type: application/json" \
  -H "x-import-token: <IMPORT_TOKEN>" \
  -d '{"limit":5,"enqueue":false,"options":[{"type":"force_obj","field":"doc_id","value":"E144420N25"}]}'
```

## 3.2) Crawl por search (sin rango)
```bash
curl -X POST https://workers-cgr.abogado.workers.dev/internal/crawl-range \
  -H "content-type: application/json" \
  -H "x-import-token: <IMPORT_TOKEN>" \
  -d '{"limit":5,"enqueue":false,"search":"E144420N25"}'
```

## 4) Compare canonical
```bash
curl -X POST https://workers-cgr.abogado.workers.dev/internal/compare-canonical \
  -H "content-type: application/json" \
  -H "x-import-token: <IMPORT_TOKEN>" \
  -d '{"dictamenId":"E000001N25"}'
```
