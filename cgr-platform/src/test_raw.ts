import { fetchDictamenesSearchPage } from './clients/cgr';

const testIds = ['E121949N25'];
const baseUrl = 'https://www.contraloria.cl';

async function test() {
    for (const id of testIds) {
        const result = await fetchDictamenesSearchPage(baseUrl, 0, [], undefined, id);
        const items = result.items || [];
        if (items.length > 0) {
            console.log(JSON.stringify(items[0], null, 2));
        }
    }
}
test();
