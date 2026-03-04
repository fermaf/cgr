import { Env } from './src/types';

export default {
    async fetch(request: Request, env: Env) {
        const ids = ['E176812N25', 'OF29349N26', 'OF29005N26', 'OF29007N26', 'OF29125N26', 'OF29008N26', 'OF28973N26', 'OF28092N26', 'OF28078N26'];
        const results = [];

        for (const id of ids) {
            const val1 = await env.DICTAMENES_SOURCE.get(id);
            const val2 = await env.DICTAMENES_SOURCE.get(`dictamen:${id}`);
            results.push({
                id,
                exists_direct: !!val1,
                exists_prefix: !!val2
            });
        }

        return new Response(JSON.stringify(results, null, 2), {
            headers: { 'content-type': 'application/json' }
        });
    }
}
