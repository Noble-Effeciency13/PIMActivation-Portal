<!--
Thanks for contributing to the PIMActivation Portal!
Please fill out the sections below. Delete those that do not apply.
-->

## Summary

<!-- A short, plain-language description of the change and the user-visible outcome. -->

## Related issue(s)

<!-- e.g. Closes #123, Refs #456 -->

## Type of change

- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would change existing behavior)
- [ ] Documentation only
- [ ] Build / CI / tooling
- [ ] Refactor / cleanup (no functional change)
- [ ] Security-relevant change

## Screenshots or recordings

<!-- For any UI change, attach before / after screenshots or a short GIF. -->

## How was this tested?

<!-- Describe the manual test path and the browsers / OS / tenants you used. -->

- Browsers tested:
- Tenant context (single-tenant / multi-tenant / guest):
- Affected PIM plane(s):

## Project ground rules

Confirm the change respects the project's hard constraints. If any box is unchecked, please call out why in the description.

- [ ] No backend, proxy, or third-party API was added.
- [ ] No new third-party origin was introduced without a corresponding update to the Content Security Policy in `Portal/staticwebapp.config.json`.
- [ ] No inline scripts and no `eval` were introduced.
- [ ] Tokens and credentials still live only in `sessionStorage` (no `localStorage`, IndexedDB, cookies, or other persistent storage).
- [ ] Delegated permissions only — no application permissions, secrets, or service-principal credentials were added.
- [ ] If Bicep was changed, `Portal/deploy/azuredeploy.json` was rebuilt (or the **Sync Deployment Templates** workflow will regenerate it on merge).
- [ ] `CHANGELOG.md` updated under `## [Unreleased]` for any user-visible change.

## AI-assisted development

If significant portions of this PR were produced with AI tools (GitHub Copilot, Claude, ChatGPT, etc.), please mention which tools and roughly which areas. All code must be understood, tested, and validated regardless of how it was produced.

<!-- e.g. "Used Copilot for inline completions; Claude for the batch-engine refactor." -->

## Additional notes

<!-- Anything else reviewers should know — follow-ups, known limitations, deferred work. -->
