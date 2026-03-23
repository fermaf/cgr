import { execSync } from 'child_process';
import * as fs from 'fs';

function levenshtein(a: string, b: string): number {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    let matrix = Array(b.length + 1).fill(0).map((_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        let prev = i;
        for (let j = 1; j <= b.length; j++) {
            let val = b[j - 1] === a[i - 1] ? matrix[j - 1] : Math.min(matrix[j - 1], matrix[j], prev) + 1;
            matrix[j - 1] = prev;
            prev = val;
        }
        matrix[b.length] = prev;
    }
    return matrix[b.length];
}

function normalizeBase(t: string): string {
    return t.toLowerCase().trim().replace(/[\.\s]+$/, '').trim();
}

function normalizeDisplay(t: string): string {
    let norm = t.trim().replace(/[\.\s]+$/, '');
    if (norm.length > 0) {
        norm = norm.charAt(0).toUpperCase() + norm.slice(1) + '.';
    }
    return norm;
}

function processItems(items: Array<{id?: number, value: string}>) {
    console.log(`Processing ${items.length} items...`);
    const byNorm = new Map<string, typeof items>();
    for (const item of items) {
        const norm = normalizeBase(item.value);
        if (norm.length === 0) continue;
        if (!byNorm.has(norm)) byNorm.set(norm, []);
        byNorm.get(norm)!.push(item);
    }

    const uniqueNorms = Array.from(byNorm.keys());
    
    // Sort alphabetically so similar typos are adjacent
    uniqueNorms.sort();
    
    console.log(`Unique normalized terms: ${uniqueNorms.length}`);

    const parent = new Map<string, string>();
    function find(i: string): string {
        if (!parent.has(i)) parent.set(i, i);
        if (parent.get(i) === i) return i;
        const p = find(parent.get(i)!);
        parent.set(i, p);
        return p;
    }
    function union(i: string, j: string) {
        const rootI = find(i);
        const rootJ = find(j);
        if (rootI !== rootJ) {
            if (rootI.length <= rootJ.length) parent.set(rootJ, rootI);
            else parent.set(rootI, rootJ);
        }
    }

    const WINDOW_SIZE = 40;
    for (let i = 0; i < uniqueNorms.length; i++) {
        const base = uniqueNorms[i];
        if (base.length < 4) continue;

        for (let j = i + 1; j < Math.min(uniqueNorms.length, i + WINDOW_SIZE); j++) {
            const target = uniqueNorms[j];
            const lenDiff = Math.abs(target.length - base.length);
            if (lenDiff > 3) continue;

            const dist = levenshtein(base, target);
            let maxDist = 1;
            if (base.length > 10) maxDist = 2;

            if (dist <= maxDist) {
                union(base, target);
            }
        }
    }

    const clusters = new Map<string, typeof items>();
    for (const norm of uniqueNorms) {
        const root = find(norm);
        if (!clusters.has(root)) clusters.set(root, []);
        // add only distinct exact names? We already have all items in byNorm
        clusters.get(root)!.push(...byNorm.get(norm)!);
    }

    const result = [];
    let countChanged = 0;
    for (const [rootNorm, clusterItems] of clusters.entries()) {
        const isCluster = clusterItems.length > 1;
        // Check if any item in cluster needs capitalization or trailing dot fix
        const needsDisplayFix = clusterItems.some(i => i.value !== normalizeDisplay(i.value));
        
        if (isCluster || needsDisplayFix) {
            countChanged++;
            const canonical = normalizeDisplay(rootNorm);
            result.push({
                rootNorm,
                canonical,
                items: clusterItems
            });
        }
    }
    console.log(`Found ${countChanged} clusters or items requiring update.`);
    return result;
}

function runGenerate() {
    console.log('Fetching cat_descriptores...');
    const descOutput = execSync(`npx wrangler d1 execute cgr-dictamenes --remote --command="SELECT id, termino FROM cat_descriptores" --json`, { maxBuffer: 1024 * 1024 * 50 });
    const descriptores: { id: number, termino: string }[] = JSON.parse(descOutput.toString())[0].results;

    console.log('Fetching dictamen_etiquetas_llm...');
    const etiqOutput = execSync(`npx wrangler d1 execute cgr-dictamenes --remote --command="SELECT DISTINCT etiqueta FROM dictamen_etiquetas_llm" --json`, { maxBuffer: 1024 * 1024 * 50 });
    const etiquetas: { etiqueta: string }[] = JSON.parse(etiqOutput.toString())[0].results;

    console.log('Analyzing descriptores...');
    const descClusters = processItems(descriptores.map(d => ({id: d.id, value: d.termino})));

    console.log('Analyzing etiquetas...');
    const etiqClusters = processItems(etiquetas.map(e => ({value: e.etiqueta})));

    console.log('Generating files...');
    
    // 1. Reporte
    let reporteMD = `# Reporte de Auditoría y Homologación de Filtros\n\n`;
    reporteMD += `Generado automáticamente. Este documento detalla la homologación semántica en la Base de Datos.\n\n`;
    
    reporteMD += `## Descriptores (cat_descriptores)\n\n| Descriptor Canónico | Variantes Unificadas / Reemplazadas |\n|---|---|\n`;
    let sqlMigration = `\n`;

    // Para descriptores:
    sqlMigration += `-- ====== DESCRIPTORES ======\n`;

    let descUpdates = 0;
    for (const c of descClusters) {
        if (c.items.length === 0) continue;
        // If there's multiple items, pick the shortest as canonical master ID. Or just pick the first.
        // Let's sort to deterministically pick an ID.
        c.items.sort((a,b) => (a.value.length === b.value.length) ? (a.id! - b.id!) : (a.value.length - b.value.length));
        const canonicalId = c.items[0].id!;
        const canonicalText = c.canonical.replace(/'/g, "''");
        
        // Report
        const variations = Array.from(new Set(c.items.map(i => i.value))).join(', ');
        reporteMD += `| **${c.canonical}** | ${variations} |\n`;

        // SQL: Update exact canonical name for master
        sqlMigration += `UPDATE cat_descriptores SET termino = '${canonicalText}' WHERE id = ${canonicalId};\n`;
        descUpdates++;

        // Delete others and remap
        const othersIds = c.items.filter(i => i.id !== canonicalId).map(i => i.id);
        if (othersIds.length > 0) {
            const othersList = othersIds.join(',');
            sqlMigration += `INSERT OR IGNORE INTO dictamen_descriptores (dictamen_id, descriptor_id) SELECT dictamen_id, ${canonicalId} FROM dictamen_descriptores WHERE descriptor_id IN (${othersList});\n`;
            sqlMigration += `DELETE FROM dictamen_descriptores WHERE descriptor_id IN (${othersList});\n`;
            sqlMigration += `DELETE FROM cat_descriptores WHERE id IN (${othersList});\n`;
            descUpdates++;
        }
    }

    reporteMD += `\n## Etiquetas LLM (dictamen_etiquetas_llm)\n\n| Etiqueta Canónica | Variantes Unificadas / Reemplazadas |\n|---|---|\n`;
    sqlMigration += `\n-- ====== ETIQUETAS LLM ======\n`;
    let etiqUpdates = 0;
    for (const c of etiqClusters) {
        if (c.items.length === 0) continue;
        const canonicalText = c.canonical.replace(/'/g, "''");
        
        const variations = Array.from(new Set(c.items.map(i => i.value)));
        reporteMD += `| **${c.canonical}** | ${variations.join(', ')} |\n`;

        const otherTexts = variations.filter(v => v !== c.canonical).map(v => `'${v.replace(/'/g, "''")}'`).join(',');
        
        // Si hay un cambio o unificación de textos
        if (otherTexts.length > 0) {
           sqlMigration += `UPDATE dictamen_etiquetas_llm SET etiqueta = '${canonicalText}' WHERE etiqueta IN (${otherTexts});\n`;
           etiqUpdates++;
        }
        
        // Forzar formato sobre el que ya esté
        sqlMigration += `UPDATE dictamen_etiquetas_llm SET etiqueta = '${canonicalText}' WHERE LOWER(etiqueta) = LOWER('${canonicalText}') AND etiqueta != '${canonicalText}';\n`;
    }

    // Deduplication purges after labels rename
    sqlMigration += `\n-- Eliminar duplicados exactos en etiquetas LLM tras unificación\n`;
    sqlMigration += `DELETE FROM dictamen_etiquetas_llm WHERE id NOT IN (SELECT MIN(id) FROM dictamen_etiquetas_llm GROUP BY dictamen_id, etiqueta);\n`;

    fs.writeFileSync('/tmp/reporte_auditoria_similitudes.md', reporteMD);
    fs.writeFileSync('/tmp/migration_script.sql', sqlMigration);

    console.log(`Generated report and SQL with ${descUpdates} descriptor operations and ${etiqUpdates} etiqueta operations.`);
}

runGenerate();
