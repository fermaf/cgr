import type { Env } from '../src/types';
import type { DictamenMetadataLean } from '../src/lib/doctrinalMetadata';
import { fetchMetadataFromD1 } from '../src/lib/doctrinalMetadata';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function createMockDb(row: DictamenMetadataLean | null): Env['DB'] {
  return {
    prepare(sql: string) {
      assert(sql.includes('dictamen_metadata_doctrinal'), 'La consulta debe leer dictamen_metadata_doctrinal');
      return {
        bind(...values: unknown[]) {
          assert(values[0] === 'doctrinal_metadata_v1', 'Debe filtrar por la versión doctrinal correcta');
          return {
            async first<T>() {
              return row as T | null;
            }
          };
        }
      };
    }
  } as Env['DB'];
}

export async function runDoctrinalMetadataSmokeTest(): Promise<void> {
  const expected: DictamenMetadataLean = {
    dictamen_id: 'D-2026-001',
    rol_principal: 'nucleo_doctrinal',
    estado_intervencion_cgr: 'intervencion_normal',
    estado_vigencia: 'vigente_visible',
    reading_role: 'entrada_doctrinal',
    reading_weight: 0.91,
    currentness_score: 0.84,
    historical_significance_score: 0.12,
    doctrinal_centrality_score: 0.88,
    family_eligibility_score: 0.73,
    confidence_global: 0.97,
    supports_state_current: 1,
    signals_litigious_matter: 0,
    signals_abstention: 0,
    signals_competence_closure: 0,
    signals_operational_rule: 1
  };

  const env = {
    DB: createMockDb(expected)
  } as Pick<Env, 'DB'>;

  const row = await fetchMetadataFromD1(env as Env, expected.dictamen_id);
  assert(row !== null, 'La lectura D1 debe devolver metadata cuando existe');
  assert(row.dictamen_id === expected.dictamen_id, 'Debe leer el dictamen correcto');
  assert(row.reading_role === expected.reading_role, 'Debe preservar el reading_role');
}
