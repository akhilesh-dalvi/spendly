# Security Policy

Spendly handles personal financial activity, so protecting user data is a
priority. We appreciate responsible reports that help keep the project and its
users safe.

## Supported versions

Security fixes are applied to the latest version of Spendly on the `master`
branch and to the official hosted application. Older commits, forks, and
third-party deployments are not supported.

## Reporting a vulnerability

Do not disclose suspected vulnerabilities in a public issue, discussion, pull
request, or social media post.

Report them privately through
[GitHub's private vulnerability reporting](https://github.com/akhilesh-dalvi/spendly/security/advisories/new).

Include as much of the following as possible:

- A description of the vulnerability and its potential impact
- The affected page, endpoint, component, or file
- Reproduction steps or a minimal proof of concept
- Any conditions required to reproduce the issue
- A suggested remediation, if you have one

Do not include real user financial data, authentication tokens, secrets, or
other sensitive information beyond what is strictly necessary to demonstrate
the issue.

We aim to acknowledge reports within three business days. After reviewing the
report, we will share our assessment and, when applicable, expected remediation
steps. Please allow reasonable time for a fix before publishing details.

## Responsible research

When investigating a potential vulnerability:

- Access only accounts and data that you own or have explicit permission to use
- Stop testing and report the issue if you encounter another user's data
- Do not modify or delete data that is not your own
- Do not disrupt the service, degrade availability, or run denial-of-service
  tests
- Do not use social engineering, spam, or automated scanning against the hosted
  application
- Make a good-faith effort to avoid privacy violations and unnecessary data
  exposure

Good-faith research that follows this policy will not result in legal action
from the Spendly project. We will work with reporters to understand and resolve
valid findings, and we will credit them if they wish to be acknowledged.

## Out of scope

The following are generally out of scope unless they demonstrate a concrete
security impact on Spendly:

- Vulnerabilities in Clerk, Convex, Vercel, or another third-party service that
  are not caused by Spendly's configuration or integration
- Missing security headers without a working exploit
- Clickjacking on pages without sensitive actions
- Self-XSS or issues that require executing code in your own browser session
- Reports based only on an automated dependency or vulnerability scan
- Attacks requiring physical access to a user's device
