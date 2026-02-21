export const onRequest: PagesFunction = async (context) => {
    const request = context.request;
    const url = new URL(request.url);

    // Proxy all requests targeting /api/* to the main cgr-platform worker
    const remoteUrl = `https://cgr-platform.abogado.workers.dev${url.pathname}${url.search}`;

    const modifiedRequest = new Request(remoteUrl, request);
    modifiedRequest.headers.set("X-Forwarded-Host", url.hostname);

    try {
        const response = await fetch(modifiedRequest);

        // We recreate the response to ensure CORS is preserved or clean, if needed
        const newResponse = new Response(response.body, response);
        newResponse.headers.set('Access-Control-Allow-Origin', '*');

        return newResponse;
    } catch (err: any) {
        return new Response(
            JSON.stringify({ error: "Proxy Error towards cgr-platform", details: err.message }),
            {
                status: 502,
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );
    }
};
