import { Component, inject, OnInit } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router, ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DetailsComponent } from './details.component';
import { PeppolService } from './peppol.service';
import { PeppolResponse, PeppolMatch } from './peppol.types';
import { API_BASE, API_PATH, DEFAULTS, QUERY_KEYS, TEXT, MAX_RETURNABLE_RESULTS } from './app.config';
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
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly peppol = inject(PeppolService);
  
  searchQuery = '';
  countryFilter = '';
  currentPage = 0;
  pageSize: number = DEFAULTS.PAGE_SIZE; // Default page size
  pageSizes = PAGE_SIZES as readonly number[];
  europeCountries: Array<{ code: string; name: string }> = [];
  otherCountries: Array<{ code: string; name: string }> = [];
  result: PeppolResponse | null = null;
  selectedMatch: PeppolMatch | null = null;
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

  ngOnInit() {
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
  // The URL uses 1-based page numbers for human friendliness. Convert
  // to zero-based internal `currentPage` by subtracting 1. If no param
  // is present or parsing fails, default to 0.
  const rawPage = parseInt(params[QUERY_KEYS.RESULT_PAGE_INDEX], 10);
  const nextPage = Number.isNaN(rawPage) ? 0 : Math.max(0, rawPage - 1);
      const nextPageSize = parseInt(params[QUERY_KEYS.RESULT_PAGE_COUNT], 10) || DEFAULTS.PAGE_SIZE;
      const selectedId = params[QUERY_KEYS.SELECTED] || null;

      // detect whether search parameters changed
      const searchParamsChanged = nextQuery !== lastQuery || nextCountry !== lastCountry || nextPage !== lastPage || nextPageSize !== lastPageSize;

      // update local state
      this.searchQuery = nextQuery;
      this.countryFilter = nextCountry;
      this.currentPage = nextPage;
      this.pageSize = nextPageSize;

      if (selectedId) {
        const found = this.result?.matches?.find(m => m.participantID?.value === selectedId) || null;
        if (found) {
          this.selectedMatch = found;
          this.pendingSelectedId = null;
        } else {
          this.selectedMatch = null;
          this.pendingSelectedId = selectedId;
        }
      } else {
        this.selectedMatch = null;
        this.pendingSelectedId = null;
      }

      // Only perform search when search-relevant params changed or we have no cached result
      if (searchParamsChanged || !this.result) {
        lastQuery = nextQuery;
        lastCountry = nextCountry;
        lastPage = nextPage;
        lastPageSize = nextPageSize;
        this.performSearch();
      }
    });
  }

  search() {
    this.currentPage = 0; // Reset to first page on new search
    this.updateUrl();
  }

  performSearch() {
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
    this.updateUrl();
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
    // push selected id into URL so navigation history includes the details view
    const qp: any = { [QUERY_KEYS.SELECTED]: match.participantID?.value ?? null };
    this.router.navigate([], { relativeTo: this.route, queryParams: qp, queryParamsHandling: 'merge' });
  }

  backToList() {
    this.selectedMatch = null;
    // remove selected from URL to return to list state in history
    const qp: any = { [QUERY_KEYS.SELECTED]: null };
    this.router.navigate([], { relativeTo: this.route, queryParams: qp, queryParamsHandling: 'merge' });
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
    this.updateUrl();
  }

  clearCountryFilter() {
    this.countryFilter = '';
    this.currentPage = 0;
    this.updateUrl();
  }

  private updateUrl() {
    const queryParams: any = {
      [QUERY_KEYS.Q]: this.searchQuery.trim() ? this.searchQuery : null,
      [QUERY_KEYS.COUNTRY]: this.countryFilter && this.countryFilter.length ? this.countryFilter : null,
      // Store 1-based page index in the URL so users see page numbers starting at 1.
      [QUERY_KEYS.RESULT_PAGE_INDEX]: this.currentPage != null ? (this.currentPage + 1) : null,
      [QUERY_KEYS.RESULT_PAGE_COUNT]: this.pageSize !== DEFAULTS.PAGE_SIZE ? this.pageSize : null
    };

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge'
    });
  }
}