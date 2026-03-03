# Peppol Directory Browser

Angular 21.2 + Tailwind CSS single-page app for searching the Peppol Directory.

This Angular app is configured to publish to GitHub Pages via GitHub Actions.

Manual build (for testing)

```pwsh
npm install
npm run build:ghpages
```

Important note about API requests

- The app now calls `https://directory.peppol.eu` directly. If the upstream API does not allow cross-origin requests from your deployment origin (for example, GitHub Pages), you will need to host a small backend proxy or serve from an origin with permissive CORS. The previous public-proxy workaround has been removed.
