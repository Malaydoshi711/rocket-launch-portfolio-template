import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { education, experience, profile, publications, site } from "./src/data/content.ts";

/* Fills index.html, sitemap.xml and robots.txt from src/data/content.ts,
   so the domain, title, description and person details live in one place. */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const base = site.url.endsWith("/") ? site.url : `${site.url}/`;
const abs = (path: string) => new URL(path.replace(/^\//, ""), base).href;

function head() {
  const now = experience[0];
  const award = publications.find((p) => p.award);
  const person: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: profile.name,
    url: base,
    jobTitle: now?.role ?? profile.role,
    ...(now && { worksFor: { "@type": "Organization", name: now.org } }),
    ...(education && { alumniOf: { "@type": "CollegeOrUniversity", name: education.school } }),
    address: { "@type": "PostalAddress", addressLocality: profile.city, addressCountry: profile.countryCode },
    email: `mailto:${profile.email}`,
    ...(award && { award: `${award.note ?? "Award"}, ${award.venue}` }),
    knowsAbout: profile.knowsAbout,
    sameAs: site.socials.map((l) => l.href).filter((h) => /^https?:/.test(h)),
    ...(site.fictional && { description: site.footerNote }),
  };
  const og = abs(site.ogImage);
  return [
    `<title>${esc(site.title)}</title>`,
    `<meta name="description" content="${esc(site.description)}" />`,
    `<meta name="author" content="${esc(profile.name)}" />`,
    `<meta name="theme-color" content="${site.themeColor}" />`,
    `<link rel="canonical" href="${base}" />`,
    `<meta property="og:type" content="profile" />`,
    `<meta property="og:locale" content="${site.locale}" />`,
    `<meta property="og:url" content="${base}" />`,
    `<meta property="og:title" content="${esc(site.title)}" />`,
    `<meta property="og:description" content="${esc(site.shareDescription)}" />`,
    `<meta property="og:image" content="${og}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(site.title)}" />`,
    `<meta name="twitter:description" content="${esc(site.shareDescription)}" />`,
    `<meta name="twitter:image" content="${og}" />`,
    `<script type="application/ld+json">${JSON.stringify(person).replace(/</g, "\\u003c")}</script>`,
  ].join("\n    ");
}

const sitemap = () => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${base}</loc><lastmod>${new Date().toISOString().slice(0, 10)}</lastmod><priority>1.0</priority></url>
</urlset>
`;
const robots = () => `User-agent: *\nAllow: /\n\nSitemap: ${abs("sitemap.xml")}\n`;

function fromContent(): Plugin {
  return {
    name: "site-from-content",
    transformIndexHtml(html) {
      return html
        .replace("<!--site-head-->", head())
        .replace('<html lang="en">', `<html lang="${site.lang}">`)
        .replace("<!--site-noscript-->", esc(`${profile.name}, ${profile.role}. Email ${profile.email}.${site.footerNote ? ` ${site.footerNote}` : ""}`));
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const files: Record<string, [string, () => string]> = { "/sitemap.xml": ["application/xml", sitemap], "/robots.txt": ["text/plain", robots] };
        const f = req.url && files[req.url.split("?")[0]];
        if (!f) return next();
        res.setHeader("Content-Type", f[0]);
        res.end(f[1]());
      });
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "sitemap.xml", source: sitemap() });
      this.emitFile({ type: "asset", fileName: "robots.txt", source: robots() });
    },
  };
}

export default defineConfig({
  plugins: [react(), fromContent()],
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // Split the big libraries into their own cached files.
        manualChunks(id: string) {
          if (/[\\/]node_modules[\\/]three[\\/]/.test(id)) return "three";
          if (/[\\/]node_modules[\\/](gsap|lenis)[\\/]/.test(id)) return "gsap";
        },
      },
    },
  },
});
