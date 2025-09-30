import { Component, inject, OnInit } from '@angular/core';
import { Router, ActivatedRoute, NavigationEnd } from '@angular/router';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DetailsComponent } from './details.component';
import { PeppolService } from './peppol.service';
import { PeppolResponse, PeppolMatch } from './peppol.types';
import { API_BASE, API_PATH, DEFAULTS, QUERY_KEYS, TEXT, MAX_RETURNABLE_RESULTS } from './app.config';
import { stripBaseHrefFromLocation, stripBaseHrefFromUrl } from './url.utils';
import { PAGE_SIZES } from './design.tokens';
import { COUNTRY_NAMES, EUROPE_ALPHA2 } from './app.constants';



@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, DetailsComponent],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly peppol = inject(PeppolService);
  private readonly location = inject(Location);
  
  searchQuery = '';
  countryFilter = '';
  currentPage = 0;
  pageSize: number = DEFAULTS.PAGE_SIZE; // Default page size
  pageSizes = PAGE_SIZES as readonly number[];
  europeCountries: Array<{ code: string; name: string }> = [];
  otherCountries: Array<{ code: string; name: string }> = [];
  result: PeppolResponse | null = null;
  selectedMatch: PeppolMatch | null = null;
  // When a participant is addressed via the URL path (e.g. /directory/0192:...)
  isPathParticipant = false;
  // store a selected participant id if it arrives via URL before results are loaded
  pendingSelectedId: string | null = null;
  // (Previously used to probe API last-result-index; removed.)
  // (No caching — pagination computed from each response's total-result-count.)
  // Start with no search performed so we don't display 'no results' on load.
  searchPerformed = false;
  filteredMatches: PeppolMatch[] = [];
  readonly TEXT = TEXT;
  readonly MAX_RETURNABLE_RESULTS = MAX_RETURNABLE_RESULTS;
  isLoading = false;
  // Simple history behavior: push by default, replace only when explicitly requested.

  // Use shared utilities for robust handling of base href and URL parsing
  // when the app is hosted under a repo subpath (e.g. GitHub Pages).

  ngOnInit() {
    // On initial load we may land on a detail path like '/directory/:id'.
    // If so, fetch the participant immediately. Strip any base-href (for
    // example GitHub Pages repo subpaths) before parsing so the app can
    // reliably detect '/directory/:id'.
    try {
  const rawPath = stripBaseHrefFromLocation();
      const segments = rawPath.split('/').filter(Boolean);
      if (segments.length >= 2 && segments[0] === 'directory' && /:/.test(segments[1])) {
        this.loadParticipantById(segments[1]);
      }
    } catch {
      // ignore path parsing errors
    }
    // Build ordered country lists: Europe first, then the rest
    const seen = new Set<string>();
    for (const code of EUROPE_ALPHA2) {
      const name = COUNTRY_NAMES[code] || code;
      this.europeCountries.push({ code, name });
      seen.add(code);
    }
    // add remaining countries sorted alphabetically by name
    const others = Object.keys(COUNTRY_NAMES)
      .filter(c => !seen.has(c))
      .map(c => ({ code: c, name: COUNTRY_NAMES[c] }))
      .sort((a, b) => a.name.localeCompare(b.name));
    this.otherCountries = others;

    // Subscribe to query params but avoid re-fetching the search when only the
    // selected id changes (navigating to details). We use simple equality
    // checks to determine whether q/country/page/pageSize changed.
  let lastQuery = '';
  let lastCountry = '';
  let lastPage = 0;
  let lastPageSize: number = DEFAULTS.PAGE_SIZE as number;

    this.route.queryParams.subscribe(params => {
      const nextQuery = params[QUERY_KEYS.Q] || '';
      const nextCountry = params[QUERY_KEYS.COUNTRY] || '';
      // Redirect legacy query-based participant URLs to the canonical
      // path-based form `/directory/<participant-id>` when no search
      // query is present. Some external links may still use
      // `?participant=<id>` — handle that here and bail out so the
      // router receives the new path.
      const legacyParticipant = params['participant'] || params['selected'] || null;
      if (legacyParticipant && !nextQuery) {
        try {
          // Replace the current entry when doing an automatic redirect
          // from a legacy query URL so the back button doesn't take the
          // user back to the old query form.
          this.router.navigateByUrl(`/directory/${legacyParticipant}`, { replaceUrl: true });
        } catch (e) {
          // ignore navigation errors
        }
        return;
      }
  // The URL uses 1-based page numbers for human friendliness. Convert
  // to zero-based internal `currentPage` by subtracting 1. If no param
  // is present or parsing fails, default to 0.
  const rawPage = parseInt(params[QUERY_KEYS.RESULT_PAGE_INDEX], 10);
  const nextPage = Number.isNaN(rawPage) ? 0 : Math.max(0, rawPage - 1);
    const nextPageSize = parseInt(params[QUERY_KEYS.RESULT_PAGE_COUNT], 10) || DEFAULTS.PAGE_SIZE;

      // detect whether search parameters changed
      const searchParamsChanged = nextQuery !== lastQuery || nextCountry !== lastCountry || nextPage !== lastPage || nextPageSize !== lastPageSize;

      // update local state
      this.searchQuery = nextQuery;
      this.countryFilter = nextCountry;
      this.currentPage = nextPage;
      this.pageSize = nextPageSize;

      // Selection is handled via path-based '/directory/<id>' only.
      // If a pendingSelectedId was set earlier (from path detection), we keep it.

      // Only perform search when search-relevant params changed or we have no cached result
      if (searchParamsChanged || !this.result) {
        lastQuery = nextQuery;
        lastCountry = nextCountry;
        lastPage = nextPage;
        lastPageSize = nextPageSize;
        this.performSearch();
      }
    });

    // Listen for router navigation events so path-only changes (for
    // example Back/Forward navigation) update the component state. This
    // ensures returning from `/directory/:id` to `/directory` clears the
    // selected match, and direct navigation to `/directory/:id` loads it.
    this.router.events.subscribe(evt => {
      if (evt instanceof NavigationEnd) {
        try {
          // Use the Router to parse the URL so NavigationEnd (including
          // history popstate/back/forward) is handled consistently.
          const navEnd = evt as NavigationEnd;
          const urlToParse = navEnd.urlAfterRedirects || navEnd.url || this.router.url || '';
          const stripped = stripBaseHrefFromUrl(urlToParse || '');
          // Ensure the string starts with '/' for parseUrl
          const normalized = stripped.startsWith('/') ? stripped : '/' + stripped;
          const tree = this.router.parseUrl(normalized);
          const primary = (tree.root && (tree.root.children as any)['primary']) || null;
          const segments = primary && primary.segments ? primary.segments.map((s: any) => s.path) : [];

          if (segments.length >= 2 && segments[0] === 'directory' && /:/.test(segments[1])) {
            this.loadParticipantById(segments[1]);
          } else if (segments.length === 1 && segments[0] === 'directory') {
            this.selectedMatch = null;
            this.pendingSelectedId = null;
            this.isPathParticipant = false;
            this.isLoading = false;
          }
        } catch (e) {
          // ignore path parsing errors
        }
      }
    });

    // Native popstate handling removed. Angular Router's NavigationEnd
    // events are relied upon for history navigation. Modern browsers and
    // Angular keep the Router in sync with history; removing the
    // duplicate popstate handler avoids race conditions that previously
    // broke back/forward navigation.
  }

  private loadParticipantById(id: string) {
    // Avoid refetch if same ID already selected
    if (this.selectedMatch?.participantID?.value === id) return;
    this.pendingSelectedId = id;
    this.isPathParticipant = true;
    this.isLoading = true;
    this.peppol.fetchParticipant(id).subscribe({
      next: (data) => {
        this.selectedMatch = data?.matches?.[0] || null;
        this.pendingSelectedId = null;
        this.isLoading = false;
      },
      error: () => {
        // Fail silently on fetch errors and clear pending state
        this.pendingSelectedId = null;
        this.isLoading = false;
      }
    });
  }

  search() {
    this.currentPage = 0; // Reset to first page on new search
    this.updateUrl({ push: true });
  }

  clearSearch() {
    this.searchQuery = '';
    this.currentPage = 0;
    this.searchPerformed = false;
    this.result = null;
    this.filteredMatches = [];
    this.updateUrl({ push: true });
  }

  performSearch() {
    // Avoid sending a search when there's no query and no country filter.
    // The Peppol directory returns 404 for empty queries; skip the request
    // and clear results so the UI doesn't show an erroneous 'no results'.
    const hasQuery = !!this.searchQuery && this.searchQuery.trim().length > 0;
    const hasCountry = !!this.countryFilter && this.countryFilter.length > 0;
    if (!hasQuery && !hasCountry) {
      this.searchPerformed = false;
      this.result = null;
      this.filteredMatches = [];
      this.isLoading = false;
      return;
    }
    const params = new URLSearchParams();

    const searchTerms = this.searchQuery.trim() ? this.searchQuery.replace(/\s+/g, '+') : '';
    params.append('q', searchTerms);

    if (this.countryFilter) {
      params.append(QUERY_KEYS.COUNTRY, this.countryFilter);
    }

  // The upstream API uses a zero-based page index. Send the internal
  // zero-based `currentPage` value so the backend and app align.
  params.append(QUERY_KEYS.RESULT_PAGE_INDEX, this.currentPage.toString());
    params.append(QUERY_KEYS.RESULT_PAGE_COUNT, this.pageSize.toString());

    // Build the final request URL via the service helper (this will route
    // through the dev proxy locally or AllOrigins in production).

    // Reuse the previously constructed `params` object for the service call
    this.isLoading = true;
    this.peppol.fetchSearch(params).subscribe({
      next: (data) => {
        this.result = data;
        this.searchPerformed = true;
        this.applyFilters();
        this.isLoading = false;
      },
      error: (err) => {
        // Surface a friendly message to the user; keep raw error out of UI.
        console.error('Error fetching data:', err);
        this.searchPerformed = true;
        this.result = null;
        this.filteredMatches = [];
        this.isLoading = false;
      }
    });
  }

  applyFilters() {
    if (!this.result) {
      this.filteredMatches = [];
      return;
    }

    this.filteredMatches = this.result.matches ?? [];
    // If a selected id was present in the URL before results loaded, try to resolve it now
    if (this.pendingSelectedId) {
      const found = this.filteredMatches.find(m => m.participantID?.value === this.pendingSelectedId) || null;
      if (found) {
        this.selectedMatch = found;
        this.pendingSelectedId = null;
      }
    }
  }

  goToPage(page: number) {
    this.currentPage = page;
    this.updateUrl({ push: true });
  }

  getPaginationPages(): number[] {
    if (!this.result) return [];
    // Use the authoritative page count from getTotalPages() so the
    // UI and the 'Last' button derive from the same source of truth.
    const actualPages = this.getTotalPages() || 1;

    if (actualPages <= 1) return [];

    // Use the local `currentPage` state as the UI source of truth so
    // the active/disabled state updates immediately when the user
    // interacts, even before the backend result round-trip completes.
    const currentPage = this.currentPage ?? 0;
    const pages: number[] = [];

    // Sliding window up to 5 pages. Keep the current page centered when
    // possible, clamp to start/end when near boundaries.
    const windowSize = Math.min(5, actualPages);
    const half = Math.floor(windowSize / 2);

    // Start so current page is centered, but within [0, actualPages - windowSize]
    let start = currentPage - half;
    start = Math.max(0, Math.min(start, actualPages - windowSize));

    for (let i = start; i < start + windowSize; i++) {
      pages.push(i);
    }

    return pages;
  }

  getTotalPages(): number {
    if (!this.result) return 0;
    const rawTotal = this.result['total-result-count'] ?? 0;
    const effectiveTotal = Math.min(rawTotal, MAX_RETURNABLE_RESULTS);
    const computedPages = Math.ceil(effectiveTotal / this.pageSize) || 0;
    return Math.max(0, computedPages);
  }

  selectMatch(match: PeppolMatch) {
    this.selectedMatch = match;
    const pid = match.participantID?.value ?? null;
    if (pid) {
      // Use router state to carry the 'from' URL. This is the normal Angular
      // approach and lets `Location.back()` restore the previous route.
      const from = typeof window !== 'undefined' ? (window.location.pathname + window.location.search) : undefined;
      const extras: any = from ? { state: { from } } : {};
      // Use router.navigate to avoid subtle differences with navigateByUrl
      // and ensure params are handled consistently.
      this.router.navigate(['/directory', pid], extras);
      this.isPathParticipant = true;
    }
  }

  backToList() {
    this.selectedMatch = null;
    // remove selected from URL to return to list state in history
    if (this.isPathParticipant) {
      // Normal Angular navigation: try to go back using Location.back(). If
      // that doesn't navigate within the SPA, fall back to `/directory`.
      try {
        this.location.back();
      } catch (e) {
        this.router.navigate(['/directory']);
      }
      this.isPathParticipant = false;
    } else {
      this.router.navigate(['/directory']);
    }
  }

  getCompanyName(match: PeppolMatch): string {
    return match.entities?.[0]?.name?.[0]?.name ?? DEFAULTS.UNKNOWN;
  }

  /**
   * Format company label as "<orgid>-<registryname>".
   * Falls back to the display name when parsing fails.
   */
  getCompanyLabel(match: PeppolMatch): string {
    const pid = this.getParticipantId(match);
    if (!pid || pid === DEFAULTS.UNKNOWN) return this.getCompanyName(match);

    const parsed = this.parseParticipantId(pid);
    const orgid = parsed.organizationId || pid;
    const reg = parsed.registerName || '';
    // display as '<orgid> - <register>' similar to participant id style in details
    return `${orgid}${reg ? ' - ' + reg : ''}`;
  }

  getCountryCode(match: PeppolMatch): string {
    return match.entities?.[0]?.countryCode ?? DEFAULTS.UNKNOWN;
  }

  getCountryName(countryCode: string): string {
    return this.peppol.getCountryName(countryCode);
  }

  getRegDate(match: PeppolMatch): string {
    return match.entities?.[0]?.regDate ?? DEFAULTS.UNKNOWN;
  }

  getAdditionalInfo(match: PeppolMatch): string {
    return match.entities?.[0]?.additionalInfo ?? '';
  }

  getWebsites(match: PeppolMatch): string[] {
    const raw = match.entities?.[0]?.websites ?? match.entities?.[0]?.website ?? [];
    return Array.isArray(raw) ? raw : [raw];
  }

  getParticipantId(match: PeppolMatch): string {
    return match.participantID?.value ?? DEFAULTS.UNKNOWN;
  }

  parseParticipantId(participantId: string): { registerName: string, organizationId: string } {
    return this.peppol.parseParticipantId(participantId);
  }

  public getFlagUrl(countryCode: string): string {
    return this.peppol.getFlagUrl(countryCode);
  }

  onPageSizeChange() {
    this.currentPage = 0; // Reset to first page when changing page size
    this.updateUrl({ push: true });
  }

  clearCountryFilter() {
    this.countryFilter = '';
    this.currentPage = 0;
    this.updateUrl({ push: true });
  }

  private updateUrl(opts?: { push?: boolean }) {
    const queryParams: any = {
      [QUERY_KEYS.Q]: this.searchQuery.trim() ? this.searchQuery : null,
      [QUERY_KEYS.COUNTRY]: this.countryFilter && this.countryFilter.length ? this.countryFilter : null,
      // Store 1-based page index in the URL so users see page numbers starting at 1.
      [QUERY_KEYS.RESULT_PAGE_INDEX]: this.currentPage != null ? (this.currentPage + 1) : null,
      [QUERY_KEYS.RESULT_PAGE_COUNT]: this.pageSize !== DEFAULTS.PAGE_SIZE ? this.pageSize : null
    };

    // Prefer path-based participant URLs when there's no active search.

  // Otherwise, always keep search state under the `/directory` base path
  // so the SPA has a consistent canonical URL shape.
    // Build queryParam object for router.navigate
    const qpObj: any = {};
    for (const k of Object.keys(queryParams)) {
      const v = queryParams[k];
      if (v !== null && v !== undefined) qpObj[k] = v;
    }

    // Decide whether to navigate to a participant path or to the directory with query params
    const participantId = this.selectedMatch?.participantID?.value || this.pendingSelectedId || null;

  // Default to pushing a new history entry so back/forward work as users expect.
  const shouldReplace = opts && opts.push === false ? true : false;
  const navigationExtras: any = { replaceUrl: shouldReplace };

    if ((!this.searchQuery || this.searchQuery.trim() === '') && participantId) {
      // navigate to /directory/:id
      this.router.navigate(['/directory', participantId], navigationExtras);
      return;
    }

    // navigate to /directory with query params
    this.router.navigate(['/directory'], { ...navigationExtras, queryParams: qpObj });
  }
}