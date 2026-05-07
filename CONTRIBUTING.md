# Contributing to PIMActivation Portal

Thank you for your interest in contributing to the PIMActivation Portal — a strictly client-side, no-backend browser companion to the [PIMActivation PowerShell module](https://github.com/Noble-Effeciency13/PIMActivation). Contributions of every size are welcome, from typo fixes to new features.

This file is the short version. The long-form contributor guide — architecture, browser test matrix, CSP discipline, and the full pull-request checklist — lives in the [Contributing wiki page](docs/wiki/Contributing.md).

## Quick start

1. **Fork** the repository.
2. **Clone** your fork: `git clone https://github.com/<your-username>/PIMActivation-Portal.git`.
3. **Create** a topic branch: `git checkout -b feature/short-description`.
4. **Develop** locally — see [Local Development](docs/wiki/Local-Development.md).
5. **Test** in at least the latest Chromium and Firefox builds; prefer also testing in WebKit / Safari when UI changes are involved.
6. **Commit** with a clear, descriptive message: `git commit -m "feat(profiles): support tenant-scoped imports"`.
7. **Push** and **open a pull request** against `main`. The PR template will guide you through the rest.

## Ways to contribute

- **Bug reports** — [open a bug report](https://github.com/Noble-Effeciency13/PIMActivation-Portal/issues/new?template=bug_report.yml).
- **Feature requests** — [open a feature request](https://github.com/Noble-Effeciency13/PIMActivation-Portal/issues/new?template=feature_request.yml).
- **Documentation** — [open a documentation issue](https://github.com/Noble-Effeciency13/PIMActivation-Portal/issues/new?template=documentation_issue.yml) or send a PR against `README.md` / `docs/wiki/`.
- **Code** — bug fixes, accessibility improvements, performance work, additional policy coverage, profile features.
- **Tenant testing** — verifying behavior across single-tenant, multi-tenant, and guest scenarios is enormously helpful and rarely needs code changes.

## Project ground rules

The portal sets itself a small number of hard constraints. Pull requests that change them need explicit discussion in an issue first.

- **No backend.** Every privileged call goes from the browser directly to Microsoft Graph or Azure Resource Manager.
- **No bundler, no framework.** `Portal/` is plain HTML / CSS / vanilla JavaScript so it can be served by any static host with no build step.
- **No new third-party origins** without a corresponding update to the Content Security Policy in [`Portal/staticwebapp.config.json`](Portal/staticwebapp.config.json). The CSP is the security boundary — keep it minimal.
- **No inline scripts and no `eval`.** The CSP forbids both.
- **Tokens stay in `sessionStorage`.** Do not introduce code that persists access tokens, refresh tokens, or claims to `localStorage`, IndexedDB, cookies, or any other persistent store.
- **Delegated permissions only.** No app-only permissions, no client secrets, no service principal credentials anywhere in the codebase or in deployment artifacts.

## Coding style

- Vanilla JavaScript, modern syntax (ES2022+), no transpilation step.
- Two-space indentation, single quotes, semicolons.
- Small, well-named functions; comments where intent is non-obvious.
- DOM updates batched where reasonable; no animation frame thrashing.
- Public surface (anything attached to `window`) stays small and stable.

## Pull-request checklist

Before submitting, please confirm:

- [ ] The change keeps `Portal/` deployable as static files with no build step.
- [ ] The Content Security Policy was not weakened. If you added a new third-party origin, the CSP was updated and called out in the PR description.
- [ ] No tokens or other credentials are being persisted outside `sessionStorage`.
- [ ] Tested in Chromium and Firefox at minimum.
- [ ] If UI changed, screenshots or short GIFs are attached.
- [ ] If Bicep changed, `Portal/deploy/azuredeploy.json` was rebuilt — or the **Sync Deployment Templates** PR check will fail.
- [ ] `CHANGELOG.md` updated under `## [Unreleased]`.

## AI-assisted development

This project embraces AI-assisted development. If you used tools like GitHub Copilot, Claude, or ChatGPT for substantial parts of your contribution, please mention it in the PR description. All code must be understood, tested, and validated by the contributor regardless of how it was produced.

## Questions?

- [GitHub Discussions](https://github.com/Noble-Effeciency13/PIMActivation-Portal/discussions)
- [Project Wiki](https://github.com/Noble-Effeciency13/PIMActivation-Portal/wiki) (mirror of [`docs/wiki/`](docs/wiki))
- [Author's blog](https://www.chanceofsecurity.com/)

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE) that covers this project.

Thank you for helping make PIMActivation Portal better.
