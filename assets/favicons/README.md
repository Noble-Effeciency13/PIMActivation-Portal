# Favicons

This folder is the source of truth for favicon files used by both deployed web roots:

- `Portal/` for the Azure Static Web App portal
- `website/` for the landing page

Add the generated favicon set here. If your generator creates a nested `favicon/` folder, you can keep that shape; the sync script auto-detects it.

Then run:

```powershell
pwsh ./scripts/sync-favicons.ps1
```

Expected filenames:

- `favicon.ico`
- `favicon.svg`
- `favicon-96x96.png`
- `apple-touch-icon.png`
- `web-app-manifest-192x192.png`
- `web-app-manifest-512x512.png`
- `site.webmanifest`

The sync script copies all deployable files from this folder to `Portal/favicons/` and `website/favicons/`, and copies `favicon.ico` to both deployed roots for browsers that probe `/favicon.ico` directly.