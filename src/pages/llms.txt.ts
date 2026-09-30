import type { APIRoute } from "astro";
import tools from "../data/tools.json";

// llms.txt - a plain-text index for LLMs (https://llmstxt.org). Generated as a
// route so absolute links carry the real site origin (CI injects SITE_URL).
export const GET: APIRoute = ({ site }) => {
  const origin = site?.origin || "";
  const plain = (html: string) => html.replace(/<[^>]+>/g, "");
  const list = tools.groups
    .flatMap((g) => g.entries)
    .map((e) => `- [${e.title}](${origin}${e.url}): ${plain(e.desc)}`)
    .join("\n");
  const llms = `# Browser tools

> Browser-based tools for analog IC design, research and finance. Everything
> runs client-side; the data-driven tools are refreshed by scheduled bots.

- [Tools index](${origin}/tools/)

## Tools

${list}
`;
  return new Response(llms, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
