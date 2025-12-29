// src/services/cgrClient.ts
var CGR_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36";
var RETRY_STATUS = /* @__PURE__ */ new Set([429, 500, 502, 503, 504]);
function parsePageCursor(cursor) {
  if (!cursor) return 0;
  const match = cursor.trim().match(/\d+/);
  if (!match) return 0;
  const parsed = Number.parseInt(match[0], 10);
  return Number.isFinite(parsed) ? parsed : 0;
}
__name(parsePageCursor, "parsePageCursor");
function collectSetCookies(headers) {
  const anyHeaders = headers;
  if (anyHeaders.getSetCookie) return anyHeaders.getSetCookie();
  if (anyHeaders.getAll) return anyHeaders.getAll("set-cookie");
  const single = headers.get("set-cookie");
  return single ? [single] : [];
}
__name(collectSetCookies, "collectSetCookies");
function buildCookieHeader(setCookies) {
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
__name(buildCookieHeader, "buildCookieHeader");
async function initCgrSession(baseUrl) {
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
__name(initCgrSession, "initCgrSession");
async function fetchWithRetry(url, init, retries = 2) {
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
__name(fetchWithRetry, "fetchWithRetry");
async function fetchDictamenesPage(baseUrl, cursor, cookie) {
  const page = parsePageCursor(cursor);
  return fetchDictamenesSearchPage(baseUrl, page, [], cookie);
}
__name(fetchDictamenesPage, "fetchDictamenesPage");
async function fetchDictamenesSearchPage(baseUrl, page, options, cookie, search = "") {
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
      ...sessionCookie ? { Cookie: sessionCookie } : {}
    },
    body
  });
  if (!response.ok) {
    await response.text().catch(() => "");
    throw new Error(`CGR fetch failed: ${response.status}`);
  }
  const data = await response.json();
  const items = data.hits?.hits ?? [];
  const nextCursor = items.length > 0 ? String(page + 1) : void 0;
  return { items, nextCursor };
}
__name(fetchDictamenesSearchPage, "fetchDictamenesSearchPage");
