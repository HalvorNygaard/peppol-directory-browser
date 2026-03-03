# Peppol Directory Browser

Angular 21.2 + Tailwind CSS single-page app for searching the Peppol Directory.

This Angular app is configured to publish to GitHub Pages via GitHub Actions.

Continuous deployment

- A GitHub Actions workflow (`.github/workflows/gh-pages.yml`) builds the app and publishes the `docs/browser` output automatically on pushes to `main`.
- Do not commit generated build artifacts (`docs/`) — the workflow creates and publishes them for you.

Manual build (for testing)

```pwsh
npm install
npm run build:ghpages
```

After a successful workflow run, enable Pages (if not already) in repository Settings → Pages and set the source to GitHub Actions.

Important note about API requests

- The app now calls `https://directory.peppol.eu` directly. If the upstream API does not allow cross-origin requests from your deployment origin (for example, GitHub Pages), you will need to host a small backend proxy or serve from an origin with permissive CORS. The previous public-proxy workaround has been removed.
