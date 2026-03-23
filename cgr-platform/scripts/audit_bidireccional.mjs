import { execSync } from 'child_process';
import fs from 'fs';

const ACCOUNT_ID = '63ac4f10cdedc71a1b09256622380278';
const KV_NAMESPACE_ID = 'ac84374936a84e578928929243687a0b';
const D1_DB_ID = 'c391c767-2c72-450c-8758-bee9e20c8a35';
const API_TOKEN = 'L8FBCZr3Kmyk3Y5yJSyfWnN_KlvMVlpzj6NaaZTl'; 

const headers = {
  'Authorization': `Bearer ${API_TOKEN}`,
  'Content-Type': 'application/json'
};

function runCmd(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 });
  } catch (err) {
    console.error(`Error running ${cmd}:`, err.message);
    process.exit(1);
  }
}

async function getD1Records() {
  console.log('Fetching D1 records...');
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${D1_DB_ID}/query`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ sql: "SELECT id, estado FROM dictamenes" })
  });
  if (!res.ok) throw new Error(`D1 Error: ${await res.text()}`);
  const data = await res.json();
  if (data.errors && data.errors.length) throw new Error(`D1 API Error: ${JSON.stringify(data.errors)}`);
  return data.result[0].results;
}

async function getKVKeys() {
  console.log('Fetching KV keys (paginated)...');
  const allKeys = [];
  let cursor = '';
  do {
    const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/storage/kv/namespaces/${KV_NAMESPACE_ID}/keys${cursor ? '?cursor=' + encodeURIComponent(cursor) : ''}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`KV Error: ${await res.text()}`);
    const data = await res.json();
    if (data.errors && data.errors.length) throw new Error(`KV API Error: ${JSON.stringify(data.errors)}`);
    allKeys.push(...data.result.map(k => k.name));
    cursor = data.result_info?.cursor || '';
    if (allKeys.length % 10000 === 0) console.log(`... fetched ${allKeys.length} keys`);
  } while (cursor);
  return allKeys;
}

async function main() {
  const isFix = process.argv.includes('--fix');
  console.log(`Starting Audit... Mode: ${isFix ? 'FIX' : 'DRY-RUN'}`);

  const d1Records = await getD1Records();
  const d1Map = new Map();
  d1Records.forEach(r => d1Map.set(r.id, r.estado));
  console.log(`[D1] Loaded ${d1Map.size} records.`);

  const keys = await getKVKeys();
  const kvKeys = new Set();
  const garbageKeys = [];

  keys.forEach(name => {
    if (name.includes(':') || name.includes('_') || name.startsWith('legacy') || name.startsWith('raw')) {
       garbageKeys.push(name);
    } else {
       kvKeys.add(name);
    }
  });

  console.log(`[KV] Loaded ${kvKeys.size + garbageKeys.length} total keys (${garbageKeys.length} garbage detected)`);

  const missingInKv = [];
  for (const [id, estado] of d1Map.entries()) {
    if (!kvKeys.has(id)) {
      const foundGarbage = garbageKeys.find(gk => gk.includes(id));
      if (!foundGarbage) {
          missingInKv.push(id);
      }
    }
  }

  const missingInD1 = [];
  for (const key of kvKeys) {
    if (!d1Map.has(key)) {
      missingInD1.push(key);
    }
  }

  const withErrorButHasKv = [];
  for (const [id, estado] of d1Map.entries()) {
    if ((estado === 'error_sin_KV_source' || estado === 'error') && kvKeys.has(id)) {
       withErrorButHasKv.push(id);
    }
  }

  const report = {
    dryRun: !isFix,
    stats: {
      totalD1: d1Map.size,
      totalKV: kvKeys.size + garbageKeys.length,
      garbageKeys: garbageKeys.length,
      missingInKv: missingInKv.length,
      missingInD1: missingInD1.length,
      withErrorButHasKv: withErrorButHasKv.length
    },
    samples: {
      garbage: garbageKeys.slice(0, 5),
      missingD1: missingInD1.slice(0, 5),
      missingKv: missingInKv.slice(0, 5),
      withErrorButHasKv: withErrorButHasKv.slice(0, 5)
    }
  };

  console.log(JSON.stringify(report, null, 2));
  fs.writeFileSync('audit_report.json', JSON.stringify(report, null, 2));

  if (isFix) {
    console.log("=== EXECUTING FIXES ===");

    // 1. Fix KV Garbage keys
    if (garbageKeys.length > 0) {
      console.log(`Fixing ${garbageKeys.length} garbage KV keys...`);
      for (const badKey of garbageKeys) {
        try {
          // get raw
          const urlGet = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/storage/kv/namespaces/${KV_NAMESPACE_ID}/values/${encodeURIComponent(badKey)}`;
          const resGet = await fetch(urlGet, { headers: { 'Authorization': headers['Authorization'] }});
          if (!resGet.ok) throw new Error(`KV GET error for ${badKey}`);
          const raw = await resGet.json();
          
          let id = badKey.replace('dictamen:', '').replace('legacy:', '').replace('raw_', '').trim();
          if (raw._source && raw._source.doc_id) id = raw._source.doc_id;

          console.log(` Migrating ${badKey} -> ${id}...`);
          
          await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/storage/kv/namespaces/${KV_NAMESPACE_ID}/values/${encodeURIComponent(id)}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify(raw)
          });
          
          await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/storage/kv/namespaces/${KV_NAMESPACE_ID}/values/${encodeURIComponent(badKey)}`, {
            method: 'DELETE',
            headers
          });

        } catch (e) {
          console.error(`Error fixing KV garbage ${badKey}:`, e.message);
        }
      }
    }

    // 2. Fix D1 States mass update via SQL
    if (withErrorButHasKv.length > 0) {
      console.log(`Fixing ${withErrorButHasKv.length} D1 statuses to ingested...`);
      const sqlContent = `
        INSERT INTO historial_cambios (dictamen_id, campo_modificado, valor_anterior, valor_nuevo, origen)
        SELECT id, 'estado', estado, 'ingested', 'auditoria_bidireccional_kv_d1'
        FROM dictamenes
        WHERE estado IN ('error_sin_KV_source', 'error');
        
        UPDATE dictamenes
        SET estado = 'ingested', updated_at = CURRENT_TIMESTAMP
        WHERE estado IN ('error_sin_KV_source', 'error');
      `;
      fs.writeFileSync('/tmp/fix_d1.sql', sqlContent);
      console.log("Running mass D1 update via wrangler...");
      runCmd("npx wrangler d1 execute DB --remote --file=/tmp/fix_d1.sql");
      console.log("D1 update completed successfully.");
    }
    
    console.log("=== FIXES COMPLETED ===");
  }
}

main().catch(console.error);
