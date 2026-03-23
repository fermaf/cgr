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
    return t.toLowerCase().trim().replace(/\.$/, '').trim();
}

function normalizeDisplay(t: string): string {
    let norm = t.trim().replace(/\.$/, '');
    if (norm.length > 0) {
        norm = norm.charAt(0).toUpperCase() + norm.slice(1);
    }
    return norm;
}

function runAnalysis() {
    console.log('Fetching cat_descriptores...');
    const descOutput = execSync(`npx wrangler d1 execute cgr-dictamenes --remote --command="SELECT id, termino FROM cat_descriptores" --json`, { maxBuffer: 1024 * 1024 * 50 });
    const descriptores: { id: number, termino: string }[] = JSON.parse(descOutput.toString())[0].results;

    console.log('Fetching dictamen_etiquetas_llm...');
    const etiqOutput = execSync(`npx wrangler d1 execute cgr-dictamenes --remote --command="SELECT DISTINCT etiqueta FROM dictamen_etiquetas_llm" --json`, { maxBuffer: 1024 * 1024 * 50 });
    const etiquetas: { etiqueta: string }[] = JSON.parse(etiqOutput.toString())[0].results;

    console.log(`Loaded ${descriptores.length} descriptores and ${etiquetas.length} etiquetas únicas.`);

    function processItems(items: Array<{id?: number, value: string}>) {
        // Group by normalized base
        const byNorm = new Map<string, typeof items>();
        for (const item of items) {
            const norm = normalizeBase(item.value);
            if (!byNorm.has(norm)) byNorm.set(norm, []);
            byNorm.get(norm)!.push(item);
        }

        const uniqueNorms = Array.from(byNorm.keys());
        uniqueNorms.sort((a, b) => a.length - b.length);
        
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
                // Keep the shorter one as root to merge longer into shorter e.g. acosos -> acoso
                if (rootI.length <= rootJ.length) parent.set(rootJ, rootI);
                else parent.set(rootI, rootJ);
            }
        }

        // Only compare strings with length difference <= 3
        for (let i = 0; i < uniqueNorms.length; i++) {
            const base = uniqueNorms[i];
            if (base.length < 4) continue; // Don't merge very short acronyms

            for (let j = i + 1; j < uniqueNorms.length; j++) {
                const target = uniqueNorms[j];
                const lenDiff = target.length - base.length;
                if (lenDiff > 3) break; // Array is sorted by length!

                const dist = levenshtein(base, target);
                // thresholds: length <= 8: dist 1. length > 8: dist up to 2. length > 15: dist up to 3
                let maxDist = 1;
                if (base.length > 8) maxDist = 2;
                if (base.length > 15) maxDist = 3;

                if (dist <= maxDist) {
                    union(base, target);
                }
            }
        }

        const clusters = new Map<string, typeof items>();
        for (const norm of uniqueNorms) {
            const root = find(norm);
            if (!clusters.has(root)) clusters.set(root, []);
            clusters.get(root)!.push(...byNorm.get(norm)!);
        }

        const result = [];
        for (const [rootNorm, clusterItems] of clusters.entries()) {
            if (clusterItems.length > 1 || clusterItems.some(i => i.value !== normalizeDisplay(i.value))) {
                // Determine best canonical. Sort by frequency or just pick the simplest title-cased one without dot.
                // Shorter is generally better as root for plurals, but let's just create a synthetic canonical from rootNorm
                const canonical = normalizeDisplay(rootNorm);
                result.push({
                    canonical,
                    items: clusterItems
                });
            }
        }
        return result;
    }

    console.log('Analyzing descriptores...');
    const descItems = descriptores.map(d => ({id: d.id, value: d.termino}));
    const descClusters = processItems(descItems);

    console.log('Analyzing etiquetas...');
    const etiqItems = etiquetas.map(e => ({value: e.etiqueta}));
    const etiqClusters = processItems(etiqItems);

    const auditResult = {
        descriptores_clusters: descClusters,
        etiquetas_clusters: etiqClusters
    };

    fs.writeFileSync('audit_results.json', JSON.stringify(auditResult, null, 2));
    console.log(`Audit completed. Found ${descClusters.length} descriptor clusters and ${etiqClusters.length} etiqueta clusters needing update.`);
}

runAnalysis();
