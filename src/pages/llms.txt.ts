import type { APIRoute } from "astro";

// llms.txt — a plain-text index for LLMs (https://llmstxt.org). Generated as a
// route so absolute links carry the real site origin (CI injects SITE_URL).
export const GET: APIRoute = ({ site }) => {
  const origin = site?.origin || "";
  const llms = `# Nithin Purushothama — Analog/Mixed-Signal IC Designer

> Analog/Mixed-Signal IC designer with tapeout experience in SKY130, GF180MCU,
> IHP SG13G2, UMC 55 nm, and TSMC 28 nm. Research from the LP-CAS Lab at IIT
> Gandhinagar; industry work on PVT Monitor and Reference IPs at Omni Design
> Technologies. IEEE SSCS Code-a-Chip Travel Grant awardee (ESSERC 2026).

## The site

A single-page portfolio typeset like a LaTeX document. All sections are
anchors on the homepage:

- [Home — About, Experience, Education, Publications, Awards, Projects, Tape-outs, Finance, CV, Contact](${origin}/)

## Notebook

- [Ron/gm Design Methodology — ESSERC 2026](${origin}/notebook): full Jupyter notebook comparing the R_on/g_m methodology against g_m/I_D and the Conrad et al. [TCAS-I 2020] optimizer for dynamic amplifier design.

## Profiles

- [GitHub — chennakeshavadasa](https://github.com/chennakeshavadasa)
- [LinkedIn — Nithin Purushothama](https://www.linkedin.com/in/nithin-purushothama-70664727b/)
- [Email — nithinpurushothama@gmail.com](mailto:nithinpurushothama@gmail.com)
`;
  return new Response(llms, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
