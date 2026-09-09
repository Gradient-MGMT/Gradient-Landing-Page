import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("crawler files advertise only canonical marketing pages", async () => {
  const [robots, sitemap] = await Promise.all([read("robots.txt"), read("sitemap.xml")]);
  assert.match(robots, /^User-agent: \*$/m);
  assert.match(robots, /^Allow: \/$/m);
  assert.match(robots, /^Sitemap: https:\/\/gradientmgmt\.com\/sitemap\.xml$/m);

  const urls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]);
  assert.deepEqual(urls, [
    "https://gradientmgmt.com/",
    "https://gradientmgmt.com/about",
    "https://gradientmgmt.com/contact",
  ]);
});

test("marketing pages declare unique production canonicals", async () => {
  const pages = new Map([
    ["index.html", "https://gradientmgmt.com/"],
    ["about.html", "https://gradientmgmt.com/about"],
    ["contact.html", "https://gradientmgmt.com/contact"],
  ]);

  const descriptions = new Set();
  for (const [path, canonical] of pages) {
    const html = await read(path);
    assert.match(html, new RegExp(`<link rel="canonical" href="${canonical}"`));
    assert.match(html, new RegExp(`<meta property="og:url" content="${canonical}"`));
    const description = html.match(/<meta name="description" content="([^"]+)"/u)?.[1];
    assert.ok(description?.length > 40, `${path} needs a descriptive summary`);
    descriptions.add(description);
  }
  assert.equal(descriptions.size, pages.size);
});

test("homepage identifies Gradient MGMT without relying on image alt text", async () => {
  const html = await read("index.html");
  assert.match(html, /<span class="visually-hidden">Gradient MGMT<\/span>/);
  assert.match(html, /<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  const json = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
  const graph = JSON.parse(json)["@graph"];
  assert.deepEqual(graph.map((entry) => entry["@type"]), ["WebSite", "Organization"]);
});

test("mock investor pages opt out of search results", async () => {
  for (const path of ["portal-login.html", "portal.html"]) {
    assert.match(await read(path), /<meta name="robots" content="noindex, nofollow"/);
  }
});
