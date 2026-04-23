# Acta de Cierre - Consolidación OpenCode Fase 2a

**Fecha:** 2026-04-23
**Ciclo:** Auto-evaluación y consolidación OpenCode (continuación)

---

## Objetivo

Migrar skills operativas a Custom Tools nativas de OpenCode para eliminar la doble indirección (SKILL.md → Agente → bash → npm → tsc → node → execute) y aprovechar el mecanismo nativo de ejecución.

---

## Alcance

**Incluido:**
- Creación de `.opencode/tools/` con 3 Custom Tools: `ping`, `repo-context-scan`, `workflow-healthcheck`
- Actualización de SKILL.md correspondientes para referenciar los Custom Tools

**Excluido:**
- Migración de `metadata-quality-audit` (requiere acceso D1, complejidad alta)
- Migración de skills ingest (`skill_ingest_*`) — son backend, no agénticas
- Eliminación del runtime legacy — se mantiene como fallback

---

## Ejecución

| Etapa | Responsable | Resultado |
|---|---|---|
| Creación Custom Tools | self (build) | 3 tools creadas |
| Actualización SKILL.md | self (build) | 3 skills actualizadas |
| Verificación legacy runtime | functional-verifier | PASS - todos los `npm run agents:*` funcionan |
| Verificación estructura | agents:check | PASS |

---

## Cambios Realizados

| Archivo | Tipo | Descripción |
|---------|------|-------------|
| `.opencode/tools/ping.ts` | Nuevo | Custom tool con execute() nativo |
| `.opencode/tools/repo-context-scan.ts` | Nuevo | Custom tool con lógica copiada del legacy |
| `.opencode/tools/workflow-healthcheck.ts` | Nuevo | Custom tool con lógica copiada del legacy |
| `.opencode/skills/ping/SKILL.md` | Editado | Agregada referencia a custom tool |
| `.opencode/skills/repo-context-scan/SKILL.md` | Editado | Agregada referencia a custom tool |
| `.opencode/skills/workflow-healthcheck/SKILL.md` | Editado | Agregada referencia a custom tool |

---

## Arquitectura Resultante

```
.opencode/
├── tools/                           ← NUEVO: Motor ejecutable nativo
│   ├── ping.ts                      ← Custom tool (reemplaza skill_ping.ts)
│   ├── repo-context-scan.ts         ← Custom tool (reemplaza skill_repo_context_scan.ts)
│   └── workflow-healthcheck.ts       ← Custom tool (reemplaza skill_workflow_healthcheck.ts)
├── skills/                          ← INTERFAZ (sin cambios en lógica)
│   ├── ping/SKILL.md                ← Actualizado: referencia tool
│   ├── repo-context-scan/SKILL.md   ← Actualizado: referencia tool
│   └── workflow-healthcheck/SKILL.md ← Actualizado: referencia tool
agents/
└── skills/                          ← MANTENIDO como fallback legacy
    ├── skill_ping.ts                ← Se mantiene hasta deprecación completa
    ├── skill_repo_context_scan.ts    ← Se mantiene hasta deprecación completa
    └── skill_workflow_healthcheck.ts ← Se mantiene hasta deprecación completa
```

---

## Pendientes

| # | Pending | Prioridad | Estado |
|---|---------|-----------|--------|
| P1 | Migrar `metadata-quality-audit` a Custom Tool | Media | Pendiente - requiere acceso D1 |
| P2 | Evaluar deprecación de `skill_ping`, `skill_repo_context_scan`, `skill_workflow_healthcheck` en runtime legacy | Baja | Pendiente - primero validar que Custom Tools funcionan en producción |
| P3 | Decisión sobre futuro del runtime legacy completo | Alta | Pendiente decisión usuario |

---

## Verificación

```bash
npm run agents:test       # PASS
npm run agents:scan       # PASS
npm run agents:workflow:check  # PASS
npm run agents:check      # PASS
```

---

## Notas Técnicas

1. **Custom Tools son TypeScript puro** con SDK `@opencode-ai/plugin: 1.4.7` ya instalado
2. **No requieren compilación** — Bun las ejecuta nativamente
3. **Contexto `worktree`** reemplaza `repoRoot` del runtime legacy
4. **Sin telemetría inyectada** — los Custom Tools retornan JSON directo, no `SkillExecutionMetadata`
5. **El runtime legacy se mantiene como fallback** — los `npm run agents:*` siguen funcionando

---

## Lección Aprendida

El patrón **SKILL.md (interfaz) + Custom Tool (motor)** es la arquitectura correcta:
- SKILL.md dice **qué hace, cuándo usarla, criterios de salida** (documentación)
- Custom Tool provee **ejecución directa con contrato tipado** (motor)

Ya no hay doble indirección: el agente invoca `tool("ping")` → OpenCode ejecuta `execute()` → retorna JSON.

---

## Resultado

- **Commit:** Pendiente (usuario no solicitó)
- **Deploy:** No aplicó (consolidación interna)
- **Custom Tools creados:** 3
- **SKILL.md actualizados:** 3
- **Runtime legacy funcional:** Sí (sin regresión)
