# 3. Guía de Desarrollo y Onboarding

## 3.1 Prerequisitos

| Herramienta | Versión Mínima | Instalación |
|---|---|---|
| **Node.js** | 18+ | `curl -fsSL https://deb.nodesource.com/setup_18.x \| sudo -E bash - && sudo apt install -y nodejs` |
| **npm** | 9+ | Incluido con Node.js |
| **Wrangler CLI** | 4.x | `npm install -g wrangler` |
| **Git** | 2.x | `sudo apt install git` |

```bash
# Verificar instalación
node --version   # v18+
npm --version    # 9+
npx wrangler --version  # 4.x
```

---

## 3.2 Stack Tecnológico

### Backend (`cgr-platform/`)

| Capa | Tecnología | Propósito |
|---|---|---|
| **Runtime** | Cloudflare Workers | Ejecución serverless en el edge |
| **Framework HTTP** | Hono | Enrutador ultraliviano |
| **Lenguaje** | TypeScript (estricto) | Tipado seguro |
| **SQL** | Cloudflare D1 (SQLite) | Metadatos y enrichment |
| **KV** | Cloudflare KV | JSON crudo de dictámenes |
| **Workflows** | Cloudflare Workflows | Orquestación asíncrona |
| **LLM** | Mistral Large 2411 | Enriquecimiento IA |
| **Vectores** | Pinecone (Integrated Inference) | Búsqueda semántica |

### Frontend (`frontend/`)

| Capa | Tecnología | Propósito |
|---|---|---|
| **Framework** | React 19 | Interfaz de usuario |
| **Build** | Vite | Compilación rápida |
| **Estilos** | TailwindCSS 4 | Diseño responsivo |
| **Enrutamiento** | React Router 7 | SPA navigation |
| **Iconos** | Lucide React | Iconografía profesional |
| **Hosting** | Cloudflare Pages | Deploy estático + Functions |

---

## 3.3 Estructura del Código

### Backend

```
cgr-platform/src/
├── index.ts              # API REST (Hono) — TODOS los endpoints
├── types.ts              # Interfaces TypeScript (Env, DictamenRaw, EnrichmentRow, etc.)
├── clients/
│   ├── cgr.ts            # Scraper de CGR.cl (fetchDictamenesSearchPage)
│   ├── mistral.ts        # Cliente Mistral via OpenAI SDK → AI Gateway
│   └── pinecone.ts       # Cliente Pinecone (fetch crudo a /records endpoints)
├── storage/
│   ├── d1.ts             # ~20 funciones de acceso a D1 (upsert, query, stats)
│   ├── kv.ts             # Lectura/escritura de JSON en KV
│   └── schema.sql        # Schema DDL de las 13 tablas
├── workflows/
│   └── backfillWorkflow.ts  # Orquestador Mistral → Pinecone
├── lib/
│   └── ingest.ts         # Lógica de ingesta (extracción de ID, normalización, KV key)
└── wrangler.jsonc        # Configuración de Cloudflare (bindings, vars, cron)
```

### Frontend

```
frontend/src/
├── App.tsx               # Router principal
├── main.tsx              # Punto de entrada React
├── index.css             # Estilos globales
├── types.ts              # Contratos de API (DictamenMeta, DictamenResponse)
├── pages/
│   ├── Home.tsx           # Página de inicio con buscador
│   ├── Search.tsx         # Resultados de búsqueda con filtros
│   ├── DictamenDetail.tsx # Vista detallada de un dictamen
│   └── Stats.tsx          # Estadísticas del repositorio
├── components/
│   ├── layout/            # Sidebar, Layout
│   ├── ui/                # SearchBar, Loader
│   └── dictamen/          # DictamenCard
└── lib/
    └── api.ts             # Llamadas HTTP a la API
```

---

## 3.4 Desarrollo Local

### Backend

```bash
cd cgr-platform
npm install
npm run dev    # Levanta worker local en http://localhost:8787
```

El servidor local usa las variables de `.dev.vars` para secrets:
```
PINECONE_API_KEY=pcsk_...
MISTRAL_API_KEY=...
CF_AIG_AUTHORIZATION=Bearer ...
```

### Frontend

```bash
cd frontend
npm install
npm run dev    # Levanta Vite en http://localhost:5173
```

El frontend tiene un proxy configurado en `vite.config.ts` que redirige `/api/*` al worker local en `:8787`.

### Ambos en paralelo

Para desarrollo completo, abre dos terminales:
```bash
# Terminal 1: Backend
cd cgr-platform && npm run dev

# Terminal 2: Frontend
cd frontend && npm run dev
```

---

## 3.5 Variables de Entorno

### Variables públicas (`wrangler.jsonc` → `vars`)

| Variable | Valor | Descripción |
|---|---|---|
| `APP_TIMEZONE` | `America/Santiago` | Zona horaria para fechas |
| `CGR_BASE_URL` | `https://www.contraloria.cl` | URL base del scraper |
| `MISTRAL_API_URL` | `https://gateway.ai.cloudflare.com/v1/.../cgr-gateway/mistral/v1` | AI Gateway |
| `MISTRAL_MODEL` | `mistral-large-2411` | Modelo de IA |
| `PINECONE_INDEX_HOST` | `https://cgr-8aea039.svc.aped-4627-b74a.pinecone.io` | Host del índice vectorial |
| `PINECONE_NAMESPACE` | `mistralLarge2411` | Namespace de Pinecone |
| `CRAWL_DAYS_LOOKBACK` | `3` | Días hacia atrás que revisa el cron |
| `BACKFILL_BATCH_SIZE` | `50` | Dictámenes por batch de enriquecimiento |
| `BACKFILL_DELAY_MS` | `500` | Pausa entre llamadas a Mistral (ms) |

### Secrets (configurados con `wrangler secret put`)

| Secret | Descripción |
|---|---|
| `PINECONE_API_KEY` | API Key de Pinecone |
| `MISTRAL_API_KEY` | API Key de Mistral AI |
| `CF_AIG_AUTHORIZATION` | Token `Bearer ...` para el AI Gateway de Cloudflare |

> [!CAUTION]
> `CF_AIG_AUTHORIZATION` debe estar configurado como secret en producción. Sin él, TODAS las llamadas a Mistral fallan con `401 Unauthorized`.

### Bindings de Cloudflare

| Binding | Tipo | Nombre/ID |
|---|---|---|
| `DB` | D1 Database | `cgr-dictamenes` |
| `DICTAMENES_SOURCE` | KV Namespace | `ac84374936a84e578928929243687a0b` |
| `WORKFLOW` | Workflow | `ingest-workflow` → `IngestWorkflow` |
| `BACKFILL_WORKFLOW` | Workflow | `backfill-workflow` → `BackfillWorkflow` |

---

## 3.6 Patrones de Diseño

### 1. Separación por responsabilidad
- `clients/` → Comunicación con APIs externas (Mistral, Pinecone, CGR)
- `storage/` → Persistencia en D1 y KV
- `workflows/` → Orquestación asíncrona
- `lib/` → Lógica de negocio pura
- `index.ts` → Solo enrutamiento HTTP

### 2. Workflows como unidad de trabajo robusta
Cada paso en un Workflow (`step.do(...)`) es:
- **Idempotente**: se puede re-ejecutar sin efectos secundarios duplicados
- **Re-intentable**: si falla, Cloudflare lo reintenta solo ese paso
- **Observable**: visible en el Dashboard con estado, duración y salida

### 3. Fallback silencioso
La búsqueda vectorial siempre está envuelta en un `try/catch`. Si falla, se degrada automáticamente a SQL sin interrumpir al usuario.

### 4. Fetch crudo para Pinecone
No usamos SDK. Los endpoints de Pinecone Integrated Inference (`/records/namespaces/{ns}/upsert` y `/search`) reciben texto plano y generan embeddings internamente.

---

## 3.7 Testing Manual

### Verificar que el Worker está activo
```bash
curl https://cgr-platform.abogado.workers.dev/
# Respuesta: "CGR Platform API"
```

### Verificar estadísticas
```bash
curl https://cgr-platform.abogado.workers.dev/api/v1/stats
```

### Buscar un dictamen
```bash
curl "https://cgr-platform.abogado.workers.dev/api/v1/dictamenes?q=probidad&page=1"
```

### Obtener detalle de un dictamen
```bash
curl "https://cgr-platform.abogado.workers.dev/api/v1/dictamenes/E129499N25"
```

### Consultar D1 remotamente
```bash
npx wrangler d1 execute cgr-dictamenes --remote \
  --command="SELECT estado, COUNT(*) as count FROM dictamenes GROUP BY estado"
```
