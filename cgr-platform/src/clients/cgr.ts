// Cliente CGR: maneja sesiones y consultas al buscador oficial.
export type CgrPage = { items: Record<string, unknown>[]; nextCursor?: string };
export type CgrSearchOption = { type: string; field: string; value?: unknown; dir?: string; inner_id?: string };

const CGR_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36";
const RETRY_STATUS = new Set([429, 500, 502, 503, 504]);
function parsePageCursor(cursor?: string) {
  if (!cursor) return 0;
  const match = cursor.trim().match(/\d+/);
  if (!match) return 0;
  const parsed = Number.parseInt(match[0], 10);
  return Number.isFinite(parsed) ? parsed : 0;
}
function collectSetCookies(headers: Headers): string[] {
  const anyHeaders = headers;
  if (anyHeaders.getSetCookie) return anyHeaders.getSetCookie();
  if (anyHeaders.getAll) return anyHeaders.getAll("set-cookie");
  const single = headers.get("set-cookie");
  return single ? [single] : [];
}
function buildCookieHeader(setCookies: string[]): string | null {
  const cookies = [];
  for (const value of setCookies) {
    const pieces = value.split(/,(?=[^;]+=[^;]+)/);
    for (const piece of pieces) {
      const cookie = piece.split(";", 1)[0]?.trim();
      if (cookie) cookies.push(cookie);
    }
  }
  return cookies.length ? cookies.join("; ") : null;
}
async function initCgrSession(baseUrl: string): Promise<string | null> {
  const url = new URL("/web/cgr/buscador", baseUrl);
  const response = await fetch(url.toString(), {
    headers: { "User-Agent": CGR_USER_AGENT }
  });
  if (!response.ok) {
    await response.text().catch(() => "");
    throw new Error(`CGR init failed: ${response.status}`);
  }
  await response.text().catch(() => "");
  return buildCookieHeader(collectSetCookies(response.headers));
}
async function fetchWithRetry(url: string, init: RequestInit, retries = 2): Promise<Response> {
  let attempt = 0;
  let lastError = null;
  while (attempt <= retries) {
    try {
      const response = await fetch(url, init);
      if (!RETRY_STATUS.has(response.status)) return response;
      await response.text().catch(() => "");
      lastError = new Error(`CGR fetch failed: ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < retries) {
      await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
    }
    attempt += 1;
  }
  if (lastError instanceof Error) throw lastError;
  throw new Error("CGR fetch failed");
}
async function fetchDictamenesPage(baseUrl: string, cursor?: string, cookie?: string): Promise<CgrPage> {
  const page = parsePageCursor(cursor);
  return fetchDictamenesSearchPage(baseUrl, page, [], cookie);
}
async function fetchDictamenesSearchPage(
  baseUrl: string,
  page: number,
  options: CgrSearchOption[],
  cookie?: string,
  search = ""
): Promise<CgrPage> {
  const sessionCookie = cookie ?? await initCgrSession(baseUrl);
  const url = new URL("/apibusca/search/dictamenes", baseUrl);
  const body = JSON.stringify({
    search,
    options,
    order: "date",
    date_name: "fecha_documento",
    source: "dictamenes",
    page
  });
  const response = await fetchWithRetry(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": CGR_USER_AGENT,
      "Origin": "https://www.contraloria.cl",
      "Referer": "https://www.contraloria.cl/web/cgr/buscador",
      ...sessionCookie ? { Cookie: sessionCookie } : {}
    },
    body
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const snippet = text.slice(0, 240).replace(/\s+/g, " ");
    throw new Error(`CGR fetch failed: ${response.status} body="${snippet}"`);
  }
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const text = await response.text().catch(() => "");
    const snippet = text.slice(0, 240).replace(/\s+/g, " ");
    throw new Error(`CGR fetch non-json response: content-type="${contentType}" body="${snippet}"`);
  }
  const data = await response.json() as any;
  const items = data.hits?.hits ?? [];
  const nextCursor = items.length > 0 ? String(page + 1) : void 0;
  return { items, nextCursor };
}

export { fetchDictamenesPage, fetchDictamenesSearchPage };
