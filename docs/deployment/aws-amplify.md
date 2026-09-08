# AWS Amplify production deployment

This runbook publishes the static Gradient Management site from GitHub with AWS Amplify Hosting, serves `gradientmgmt.com` and `www.gradientmgmt.com` over HTTPS, and preserves every existing email and service record while DNS authority moves from GoDaddy to Route 53.

## Ownership boundary

- The AWS owner prepares Amplify, Route 53, certificates, records, validation, and monitoring.
- Daniel Ferris performs only the GoDaddy registrar steps in GRA-415 and GRA-416.
- The domain remains registered at GoDaddy. Changing nameservers is not a domain transfer.
- Do not use the mock investor portal as a production authentication system. It is a visual prototype with sample data, not a secure document repository.

## 1. Merge and connect the repository

1. Merge the reviewed investor-portal pull request into `main`.
2. Sign in to the intended Gradient Management AWS account and note the account ID in the deployment record.
3. Open **AWS Amplify** in the team's standard production region. If there is no existing standard, use `us-east-1` and record that decision.
4. Choose **Create new app** and **GitHub** as the repository provider.
5. Authorize the AWS Amplify GitHub App for `Gradient-MGMT/Gradient-Landing-Page` only, unless broader access is intentionally required.
6. Select the repository and the `main` branch.
7. Confirm that Amplify detects the committed `amplify.yml`. Its artifact list deliberately publishes only root HTML, CSS, JavaScript, and `assets/`; it does not publish tests or internal documentation.
8. Name the app `gradient-landing-page`, enable automatic deployments for `main`, and deploy.
9. Open the temporary `amplifyapp.com` URL and verify:
   - Home, About, Contact, and Investor Login load.
   - The mock login redirects to the investor portal.
   - CSS, fonts, logos, and images load without 404 errors.
   - The browser console has no errors.

Do not start the nameserver cutover if the Amplify URL does not pass these checks.

## 2. Inventory GoDaddy before changing anything

Daniel completes GRA-415 and attaches the export, screenshots, and full DNS record inventory. The AWS owner reviews that inventory before creating production records.

Pay special attention to:

- MX records that control mail delivery.
- SPF TXT records.
- DKIM CNAME or TXT records.
- DMARC TXT records.
- Autodiscover, Microsoft 365, Google Workspace, and service-verification records.
- Any A, AAAA, CNAME, SRV, CAA, or subdomain records used by other systems.
- Existing domain forwarding and DNSSEC state.

If a record's purpose is unclear, reproduce it exactly rather than dropping it during migration.

## 3. Create and verify the Route 53 zone

1. Open **Route 53** and choose **Hosted zones**.
2. Search for `gradientmgmt.com` before creating anything. Reuse an intentional existing public hosted zone; do not create a duplicate without understanding which zone should be authoritative.
3. If none exists, create a **Public hosted zone** named `gradientmgmt.com`.
4. Record the hosted-zone ID and the four NS values Route 53 assigns.
5. Recreate every record in the GRA-415 inventory. Do not replace or omit email/security records just because Amplify does not use them.
6. Do not copy GoDaddy's zone-level NS or SOA records. Route 53 creates its own authoritative NS and SOA records.
7. Compare the Route 53 records against GRA-415 line by line. A second person should check MX priorities, TXT quoting/spacing, DKIM selectors, SRV priorities/weights/ports, and CNAME targets.
8. If DNSSEC was enabled at GoDaddy, stop and plan the DS-record transition with the domain administrator before changing nameservers. A stale DS record can make the entire domain fail DNS validation.

## 4. Attach the custom domain in Amplify

1. In the Amplify app, open **Hosting > Custom domains** and choose **Add domain**.
2. Enter `gradientmgmt.com` and select the prepared Route 53 hosted zone when prompted.
3. Configure both the root hostname and `www`.
4. Use `gradientmgmt.com` as the canonical hostname and redirect `www.gradientmgmt.com` to it, unless the firm deliberately chooses the inverse.
5. Use the Amplify-managed certificate.
6. Let Amplify create the necessary Route 53 records, then inspect the zone and confirm it did not overwrite unrelated records.
7. Wait until Amplify shows that certificate/domain setup is ready for DNS delegation. Save a screenshot of the domain configuration.

## 5. Hand off the GoDaddy cutover

Update GRA-416 with:

- The exact four Route 53 nameservers, copied directly from the hosted zone.
- A screenshot showing the nameservers and hosted-zone name.
- The agreed cutover window.
- The AWS owner's name and contact method for live validation or rollback.

Daniel then follows GRA-416 in GoDaddy. He changes only the nameservers and does not transfer the registration or edit individual GoDaddy DNS records.

## 6. Validate immediately after delegation

From a network outside the office/VPN, verify:

```sh
dig +short NS gradientmgmt.com
dig +short MX gradientmgmt.com
dig +short TXT gradientmgmt.com
curl -I https://gradientmgmt.com
curl -I https://www.gradientmgmt.com
```

Confirm all of the following:

- Public NS results converge on all four Route 53 nameservers.
- The root and `www` URLs serve the intended site with a valid certificate and canonical redirect.
- Amplify reports the domain as available/active.
- Home, About, Contact, Investor Login, and the mock portal still load.
- Inbound and outbound email work with an external mailbox.
- MX, SPF, DKIM, and DMARC checks pass.
- Every other service recorded in GRA-415 still works.

DNS propagation can take up to 48 hours. Monitor during that period and keep the old GoDaddy export/screenshots for at least 72 hours.

## Rollback

If a critical service fails because Route 53 is missing or misconfiguring a record:

1. Ask Daniel to restore the original nameservers captured in GRA-415.
2. Record the rollback submission time.
3. Continue monitoring while the nameserver rollback propagates.
4. Correct and peer-review the Route 53 zone before trying another cutover.

## Future production investor portal

Keep the marketing site and real investor system separated. A safe next architecture is:

- `gradientmgmt.com` for the public Amplify site.
- `investor.gradientmgmt.com` for the authenticated application.
- Amazon Cognito or another OIDC-compatible identity provider behind the existing auth adapter.
- Invite-only account provisioning and mandatory TOTP MFA. Authy can act as a standards-based TOTP authenticator; avoid coupling the application to an Authy-specific login API.
- Private S3 storage with short-lived signed URLs for investor documents; never public buckets or URLs.
- Server-side authorization for every portfolio and document request, plus audit logging.
- Separate production data and configuration from the current mock data.

Do not place real credentials, investor information, statements, or tax documents into the current static portal.

## References

- [AWS Amplify build settings](https://docs.aws.amazon.com/amplify/latest/userguide/build-settings.html)
- [AWS Amplify build specification](https://docs.aws.amazon.com/amplify/latest/userguide/yml-specification-syntax.html)
- [AWS guidance for a GoDaddy-managed domain](https://docs.aws.amazon.com/amplify/latest/userguide/to-add-a-custom-domain-managed-by-godaddy.html)
- [AWS guidance for third-party DNS](https://docs.aws.amazon.com/amplify/latest/userguide/to-add-a-custom-domain-managed-by-a-third-party-dns-provider.html)
