export const RELEASE = Object.freeze({
  appId: "dmm14gzm5vsts",
  region: "us-east-1",
  profile: "gradient-admin",
  stagingBranch: "staging",
  productionBranch: "main",
  stagingUrl: "https://staging.dmm14gzm5vsts.amplifyapp.com/",
  productionUrls: ["https://gradientmgmt.com/", "https://www.gradientmgmt.com/"],
});

export function isPublicFile(path) {
  return path === "robots.txt" ||
    path === "sitemap.xml" ||
    path.startsWith("assets/") ||
    (!path.includes("/") && /\.(?:html|css|js)$/.test(path));
}
