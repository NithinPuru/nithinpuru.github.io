import type { APIRoute } from "astro";

// PWA manifest — served as a route so icon/start URLs inherit the base path
// (correct for both local builds and a GitHub Pages project site).
export const GET: APIRoute = () => {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const manifest = {
    name: "Nithin Purushothama — Analog/Mixed-Signal IC Designer",
    short_name: "Nithin P",
    description:
      "Analog/Mixed-Signal IC designer with tapeout experience in SKY130, GF180MCU, IHP SG13G2, UMC 55 nm, and TSMC 28 nm.",
    start_url: `${base}/`,
    scope: `${base}/`,
    display: "standalone",
    background_color: "#faf9f4",
    theme_color: "#faf9f4",
    icons: [
      {
        src: `${base}/android-chrome-192x192.png`,
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: `${base}/android-chrome-512x512.png`,
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
  return new Response(JSON.stringify(manifest, null, 2), {
    headers: { "Content-Type": "application/manifest+json; charset=utf-8" },
  });
};
