import { readFile } from "node:fs/promises";

const baseUrl = process.env.BASE_URL || "https://cgr-platform.abogado.workers.dev";
const queriesPath = new URL("../docs/evaluation/canonical_queries.json", import.meta.url);
const queries = JSON.parse(await readFile(queriesPath, "utf8"));

for (const query of queries) {
  try {
    const url = new URL("/api/v1/insights/doctrine-search", baseUrl);
    url.searchParams.set("q", query);
    url.searchParams.set("limit", "3");

    const response = await fetch(url);
    if (!response.ok) {
      console.log(`\n[ERROR] ${query}`);
      console.log(`HTTP ${response.status}`);
      continue;
    }

    const payload = await response.json();
    const topLine = payload.lines?.[0];
    const semanticAnchor = topLine?.semantic_anchor_dictamen?.id ?? "n/a";
    const representative = topLine?.representative_dictamen_id ?? "n/a";

    console.log(`\nQuery: ${query}`);
    console.log(`Interpretada: ${payload.overview?.query_interpreted ?? "-"}`);
    console.log(`Intent: ${payload.overview?.query_intent?.intent_label ?? "-"}`);
    console.log(`Línea principal: ${topLine?.title ?? "-"}`);
    console.log(`Representativo: ${representative}`);
    console.log(`Semantic anchor: ${semanticAnchor}`);
  } catch (error) {
    console.log(`\n[ERROR] ${query}`);
    console.log(error instanceof Error ? error.message : String(error));
  }
}
