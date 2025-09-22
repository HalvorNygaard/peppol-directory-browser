# Peppol Directory Browser

This Angular app is configured to publish to GitHub Pages from the `docs/` folder.

Continuous deployment

- A GitHub Actions workflow (`.github/workflows/gh-pages.yml`) builds the app and publishes `docs/` automatically on pushes to `main`.
- Do not commit generated build artifacts (`docs/`) — the workflow creates and publishes them for you.

Manual build (for testing)

```pwsh
npm install
npm run build:ghpages
```

If you want to publish manually, you can commit and push the `docs/` folder, but it is not required when using the CI workflow.

After a successful workflow run, enable Pages (if not already) in repository Settings → Pages and ensure the source is `main` branch `/docs` folder.

Important note about API requests

- This project currently routes API requests through the public CORS proxy `https://api.allorigins.win` when the site is served from a non-localhost origin (for example, GitHub Pages). This is a runtime workaround to avoid CORS restrictions when the upstream API does not return permissive CORS headers.