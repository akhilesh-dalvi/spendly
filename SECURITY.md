# Security policy

## Supported versions

Security fixes cover `master` and the official hosted application. During
initial-release verification, only the newest `0.x` CLI release on npm's `next`
tag receives fixes. After promotion to `latest`, only the newest release there
is supported. Older versions, forks, and third-party deployments are unsupported.

## Report privately

Use [GitHub private vulnerability reporting](https://github.com/akhilesh-dalvi/spendly/security/advisories/new),
not public issues, PRs, discussions, or social media.

Include impact, affected component, reproduction steps/conditions, and an
optional suggested fix. CLI reports should include Spendly, OS, and Node.js
versions. Use synthetic data; omit financial data, credentials, OAuth URLs,
tokens, headers, credential-store contents, and environment files.

We aim to acknowledge reports within three business days and share our assessment
and remediation plans. Allow reasonable time for a fix before publishing.

## Responsible research

- Test only accounts/data you own or have permission to use.
- Stop and report if you encounter another user's data; never modify it.
- Avoid service disruption, denial-of-service tests, social engineering, spam,
  and automated scanning of the hosted app.

Good-faith research following this policy will not result in legal action from
Spendly. Reporters may request credit.

## Out of scope without concrete Spendly impact

- Third-party vulnerabilities not caused by Spendly's integration/configuration
- Missing headers or clickjacking without sensitive actions or a working exploit
- Self-XSS or execution in the researcher's own browser session
- Scanner-only findings
- Attacks requiring physical device access
