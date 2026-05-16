# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x     | :white_check_mark: |

## Reporting a Vulnerability

**Please do not file a public GitHub issue for security vulnerabilities.**

Report security issues by emailing **simanchala@maxlence.com.au** with the subject line:
`[SECURITY] PingPulse — <brief description>`

Include:
- A description of the vulnerability and its potential impact
- Steps to reproduce or proof-of-concept
- Any suggested remediation

You will receive an acknowledgement within **48 hours** and a detailed response within **7 days**.

## Disclosure Policy

- We follow [Coordinated Vulnerability Disclosure](https://vuls.cert.org/confluence/display/CVD).
- We will credit reporters in release notes (unless you prefer anonymity).
- We ask that you give us 90 days to patch before public disclosure.

## Security Best Practices for Deployers

- Rotate `JWT_SECRET` and API keys regularly — never commit them.
- Use AWS Secrets Manager or HashiCorp Vault for production secrets (not `.env` files).
- Enable VPC-only access for all PostgreSQL and Redis instances.
- Review `k8s/secret.yaml` — it is a template; replace values before applying.
- Enable AWS CloudTrail and GuardDuty on your EKS cluster.
- All inter-service communication should stay within the Kubernetes cluster network.
