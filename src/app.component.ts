import { Component, inject, OnInit } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router, ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DetailsComponent } from './details.component';
import { PeppolService } from './peppol.service';
import { PeppolResponse, PeppolMatch } from './peppol.types';
import { API_BASE, DEFAULTS, QUERY_KEYS, TEXT } from './app.config';
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
  searchPerformed = true;
  filteredMatches: PeppolMatch[] = [];
  readonly TEXT = TEXT;

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
      const nextPage = parseInt(params[QUERY_KEYS.RESULT_PAGE_INDEX], 10) || 0;
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
  let url = `${API_BASE}?`;
    const params = new URLSearchParams();
    
    const searchTerms = this.searchQuery.trim() ? this.searchQuery.replace(/\s+/g, '+') : '';
    params.append('q', searchTerms);
    
    if (this.countryFilter) {
      params.append(QUERY_KEYS.COUNTRY, this.countryFilter);
    }
    
  params.append(QUERY_KEYS.RESULT_PAGE_INDEX, this.currentPage.toString());
  params.append(QUERY_KEYS.RESULT_PAGE_COUNT, this.pageSize.toString());
    
    url += params.toString();
    // If we're running on a non-localhost origin (i.e., GitHub Pages), route
    // the request through the public CORS proxy AllOrigins to avoid browser CORS.
    // Keep direct requests when developing locally so the dev proxy still works.
    try {
      const loc = window.location.origin;
      const isLocal = loc.startsWith('http://localhost') || loc.startsWith('http://127.0.0.1') || loc.startsWith('https://localhost') || loc.startsWith('https://127.0.0.1');
      if (!isLocal) {
        const encoded = encodeURIComponent(url);
        url = `https://api.allorigins.win/get?url=${encoded}`;
      }
    } catch (e) {
      // If window is unavailable for any reason, fall back to the original URL
      console.warn('Could not detect window.location; using direct API URL');
    }
    
    const headers = new HttpHeaders({
      'Accept': 'application/json'
    });
    
    this.http.get(url, { headers, observe: 'response' }).subscribe({
      next: (response) => {
        try {
          const contentType = response.headers.get('content-type');
          if (!contentType || !contentType.includes('application/json')) {
            throw new Error('Server returned non-JSON response');
          }
          
          this.result = response.body as PeppolResponse;
          this.searchPerformed = true;
          this.applyFilters();
        } catch (e) {
          console.error('Error processing response:', e);
          console.warn('The server returned an invalid response. See console for details.');
          this.searchPerformed = true;
          this.result = null;
          this.filteredMatches = [];
        }
      },
      error: (error) => {
  console.error('Error fetching data:', error);
  console.warn('Error fetching data. See console for details.');
        this.searchPerformed = true;
        this.result = null;
        this.filteredMatches = [];
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
    
    const totalResults = this.result['total-result-count'] ?? 0;
    const actualPages = Math.ceil(totalResults / this.pageSize || 1);
    
    if (actualPages <= 1) return [];
    
    const currentPage = this.result['result-page-index'] ?? 0;
    const pages: number[] = [];
    
    const start = Math.max(0, currentPage - 2);
    const end = Math.min(actualPages - 1, currentPage + 2);
    
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    
    return pages;
  }

  getTotalPages(): number {
    if (!this.result) return 0;
    return Math.ceil((this.result['total-result-count'] || 0) / this.pageSize);
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
      [QUERY_KEYS.RESULT_PAGE_INDEX]: this.currentPage > 0 ? this.currentPage : null,
      [QUERY_KEYS.RESULT_PAGE_COUNT]: this.pageSize !== DEFAULTS.PAGE_SIZE ? this.pageSize : null
    };

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge'
    });
  }
}