import { fetchDictamenesSearchPage } from './clients/cgr';
import { extractDictamenId } from './lib/ingest';

const testIds = ['E121949N25', 'E122697N25'];
const baseUrl = 'https://www.contraloria.cl';

async function test() {
    for (const id of testIds) {
        console.log(`\nTesting ${id}...`);
        const result = await fetchDictamenesSearchPage(baseUrl, 0, [], undefined, id);
        const items = result.items || [];
        if (items.length > 0) {
            const item = items[0];
            const extractedId = extractDictamenId(item as any);
            console.log(`Searched: ${id}, extracted: ${extractedId}`);
        } else {
            console.log(`No items found for ${id}`);
        }
    }
}
test();
