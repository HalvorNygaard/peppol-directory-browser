// Utility helpers for normalizing app URLs and stripping base hrefs.
export function getBaseHref(): string {
  try {
    const baseEl = document.querySelector('base');
    if (baseEl && baseEl.getAttribute) {
      const href = baseEl.getAttribute('href') || '';
      // Trim trailing slash for easier comparison
      return href.replace(/\/+$/, '');
    }
  } catch {
    // ignore
  }
  // If no <base> is present, return empty string so local dev paths
  // are left intact. Hosts that serve the app from a subpath should
  // include a <base href="/.../"> tag in their index.html.
  return '';
}

export function stripBaseHrefFromLocation(): string {
  try {
    const href = getBaseHref();
    const full = (window.location.pathname || '') + (window.location.search || '') + (window.location.hash || '');
    if (href && full.startsWith(href)) {
      return full.slice(href.length).replace(/\/+$/, '') || '/';
    }
    return full.replace(/\/+$/, '') || '/';
  } catch {
    return '/';
  }
}

export function stripBaseHrefFromUrl(url: string): string {
  try {
    const href = getBaseHref();
    if (href && url.startsWith(href)) {
      return url.slice(href.length).replace(/\/+$/, '') || '/';
    }
    return url.replace(/\/+$/, '') || '/';
  } catch {
    return '/';
  }
}
