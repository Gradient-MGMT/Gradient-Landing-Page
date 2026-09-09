# Staging-first release and search visibility design

## Context

Gradient MGMT is hosted as a manually deployed static site in AWS Amplify app `dmm14gzm5vsts` in `us-east-1`. The app currently has one branch, `main`, and both `gradientmgmt.com` and `www.gradientmgmt.com` resolve to that production branch. The Amplify app is not connected to GitHub, so Git merges do not deploy the site automatically.

The currently deployed production files match commit `deac4adc813edf4bde6417080117d30cbb063124`. A staging-first workflow can govern future changes, but it cannot retroactively place that already-live revision through pre-production review.

The public site is crawlable, but it currently lacks a sitemap, `robots.txt`, absolute canonical URLs, descriptive metadata, and organization/site structured data. Google does not yet surface `gradientmgmt.com` for a `site:` query or the branded query “Gradient MGMT.”

## Goals

1. Give reviewers a stable, publicly accessible staging URL before future production releases.
2. Require explicit human approval before a staged revision is promoted to production.
3. Prove that production receives the same reviewed static artifact.
4. Improve Google’s ability to discover the site and understand the Gradient MGMT entity.
5. Keep the mock investor login and portal out of search results.
6. Preserve the existing custom domain, Route 53 records, and GoDaddy registration.

## Non-goals

- Connecting Amplify to GitHub or enabling automatic production deployments.
- Adding real authentication, investor data, or a production investor portal.
- Guaranteeing a Google ranking or a specific indexing date.
- Changing the visible homepage composition or adding unapproved marketing copy.
- Treating `robots.txt` or an unlisted URL as an access-control mechanism.

## Hosting architecture

Use a second branch in the existing Amplify app:

- `staging`: stage `DEVELOPMENT`, public, manual deployments, default URL `https://staging.dmm14gzm5vsts.amplifyapp.com`.
- `main`: stage `PRODUCTION`, manual deployments, default URL `https://main.dmm14gzm5vsts.amplifyapp.com`.
- `gradientmgmt.com` and `www.gradientmgmt.com`: remain associated only with `main`.

The same-app branch design is the smallest change and requires no DNS work. Staging will not have a custom domain, basic authentication, or real investor information.

Because Amplify rewrite rules and custom headers are app-wide, staging will use the same routing behavior as production. Public pages will declare canonical URLs on `https://gradientmgmt.com`; the sitemap will contain only production URLs; and the staging URL will not be linked from the production site. These are discovery and canonicalization controls, not security controls. If hard search-engine exclusion for staging becomes a requirement, staging must move to a separate Amplify app where an app-specific `X-Robots-Tag: noindex, nofollow` header can be applied.

## Release workflow

Add a dependency-free release tool at `scripts/amplify-release.mjs` with four deliberately separate commands.

### 1. Package

`package` will:

- Require a clean Git worktree.
- Run the full automated test suite.
- Create one ZIP containing only the root HTML, CSS, JavaScript, `robots.txt`, `sitemap.xml`, and `assets/**` surface allowed by `amplify.yml`.
- Reject archives missing `index.html` or containing documentation, tests, scripts, Git metadata, or parent directories.
- Store the ZIP under ignored `.release/<full-commit-sha>/site.zip`.
- Create a manifest containing the full commit SHA, SHA-256 digest, file list, Amplify app ID, region, and the production job active when staging began.

The source commit may be a clean review branch for staging. Promotion will additionally require that the exact commit has been incorporated into Git `main` and that local `main` equals `origin/main`.

### 2. Deploy staging

`deploy-staging <manifest>` will:

- Verify the ZIP digest and manifest.
- Target only the hard-coded `staging` branch; it will not accept a generic branch argument.
- Create, upload, and immediately start a fresh Amplify manual deployment.
- Poll until the deployment succeeds or fails.
- Verify the public staging homepage returns `200`.
- Write a receipt containing the staging job ID, commit SHA, artifact digest, deployment time, and result.

The tool will print the staging URL for review and stop. It will never promote automatically.

### 3. Promote production

`promote <manifest> <receipt> --confirm-production=<sha256>` will:

- Require the full artifact digest as an explicit confirmation value.
- Reject an altered artifact, a failed or stale staging receipt, a changed production baseline, or a source commit not present in the current `origin/main`.
- Target only the hard-coded `main` branch.
- Upload the unchanged staged ZIP to a new production deployment.
- Poll for success and verify the apex and `www` URLs.
- Write a production receipt with the job ID and artifact digest.

### 4. Verify

`verify <manifest> <receipt>` will perform read-only checks for either environment. It will confirm the recorded job succeeded, the expected hostname is reachable, required site files are present, and the artifact digest matches the manifest.

Production publishing will follow this state transition:

`clean commit → packaged artifact → successful staging receipt → explicit approval → main contains commit → production promotion`

No command will combine staging and production deployment.

## Rollback

Retain the most recent successful production artifact and receipt. A rollback redeploys that known-good ZIP to `main` using a fresh Amplify deployment. Amplify job history alone is not a rollback source because prior manual deployment artifacts are not exposed for download.

For delayed or multi-person releases, the checksum-addressed artifact should later move from local `.release/` storage to a private, versioned S3 bucket. That is not required for the initial workflow.

## Search visibility changes

### Crawl discovery

Add `robots.txt` at the site root:

```text
User-agent: *
Allow: /

Sitemap: https://gradientmgmt.com/sitemap.xml
```

Add `sitemap.xml` with only these canonical public URLs:

- `https://gradientmgmt.com/`
- `https://gradientmgmt.com/about`
- `https://gradientmgmt.com/contact`

Update `amplify.yml` and the release packager allowlist so both files are deployed.

### Canonical URLs and redirects

Declare absolute canonical URLs on the home, About, and Contact pages. Change their public navigation to extensionless URLs. Add app-level `301` redirects for:

- `/index.html` to `/`
- `/about.html` to `/about`
- `/contact.html` to `/contact`
- `/mission` and `/mission.html` to `/about`
- `/team` and `/team.html` to `/contact`

Keep `www.gradientmgmt.com` redirected to the apex domain.

### Metadata and entity signals

- Give the homepage a descriptive title and description that identify Gradient MGMT as an AI-native private investment firm.
- Give About and Contact unique titles, descriptions, canonical URLs, and Open Graph URLs.
- Use the first-party `https://gradientmgmt.com/assets/share.png` image URL for social metadata.
- Keep the visible logo treatment unchanged, but include the brand name as real heading text available to assistive technology and crawlers rather than relying only on image alternative text.
- Add `WebSite` and `Organization` JSON-LD to the homepage with only verified fields: name, URL, logo, and `info@gradientmgmt.com`.
- Do not add a legal name, address, identifiers, or social-profile `sameAs` links until the firm verifies them.

### Investor pages

Add `noindex, nofollow` metadata to `portal-login.html` and `portal.html`. Do not block those pages in `robots.txt`, because crawlers must be able to fetch a page to observe its `noindex` directive.

### Search Console

After the SEO artifact is approved on staging and promoted:

1. Create a Google Search Console Domain property for `gradientmgmt.com`.
2. Add Google’s verification TXT value to the existing Route 53 hosted zone without modifying mail or service records.
3. Submit `https://gradientmgmt.com/sitemap.xml`.
4. Inspect and request indexing for `/`, `/about`, and `/contact`.
5. Confirm Google’s selected canonical matches the declared canonical.
6. Monitor Page Indexing and Search Performance over the following days and weeks.

Search Console actions require access to the firm’s Google account. The DNS TXT value can be added through the existing AWS account after Google provides it.

## Validation

Automated tests will verify:

- The archive includes exactly the configured public surface.
- Staging is the only deployment available without production confirmation.
- Promotion fails for a missing or incorrect digest, modified ZIP, failed/stale staging job, changed production baseline, dirty tree, or commit absent from `origin/main`.
- The runbook describes the real manual staging-first workflow and does not recommend automatic `main` deployment.
- Public pages include unique metadata and correct absolute canonical URLs.
- The sitemap includes only canonical marketing pages.
- Investor pages contain `noindex, nofollow`.

Before promotion, manual checks will cover desktop and mobile rendering, navigation, expected login rejection, redirects, `robots.txt`, `sitemap.xml`, and browser-console errors on staging.

After promotion, verify `200` responses for the apex, About, Contact, `robots.txt`, and `sitemap.xml`; verify `www` and legacy page redirects; and run Google’s Rich Results Test against the homepage.

## Operational rule

From the first release after this workflow is installed, no change will be uploaded directly to the production `main` branch. The staging URL is always shared first, and production promotion happens only after the user explicitly approves that staged artifact.

## References

- [AWS Amplify feature branch environments](https://docs.aws.amazon.com/amplify/latest/userguide/multi-environments.html)
- [AWS Amplify manual deployments](https://docs.aws.amazon.com/amplify/latest/userguide/manual-deploys.html)
- [AWS Amplify `CreateDeployment` API](https://docs.aws.amazon.com/amplify/latest/APIReference/API_CreateDeployment.html)
- [Google sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [Google canonical URL guidance](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- [Google organization structured data](https://developers.google.com/search/docs/appearance/structured-data/organization)
- [Google recrawl guidance](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl)
