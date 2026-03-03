import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from "@angular/core";
import { CommonModule, Location } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, NavigationEnd, Router } from "@angular/router";
import { filter } from "rxjs/operators";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { DetailsComponent } from "./details.component";
import { PeppolService } from "./peppol.service";
import { FlagCacheService } from "./flag-cache.service";
import { DEFAULTS, MAX_RETURNABLE_RESULTS, QUERY_KEYS, TEXT } from "./app.config";
import { PAGE_SIZES } from "./design.tokens";
import { COUNTRY_NAMES, EUROPE_ALPHA2 } from "./app.constants";
import { stripBaseHrefFromLocation, stripBaseHrefFromUrl } from "./url.utils";
import { buildPaginationPages } from "./pagination.utils";
import { PeppolMatch, PeppolResponse } from "./peppol.types";

@Component({
  selector: "app-directory-page",
  standalone: true,
  imports: [CommonModule, FormsModule, DetailsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./directory-page.component.html",
})
export class DirectoryPageComponent {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly peppol = inject(PeppolService);
  private readonly flagCache = inject(FlagCacheService);
  private readonly destroyRef = inject(DestroyRef);

  readonly searchQuery = signal("");
  readonly countryFilter = signal("");
  readonly currentPage = signal(0);
  readonly pageSize = signal<number>(DEFAULTS.PAGE_SIZE);
  readonly pageSizes = PAGE_SIZES as readonly number[];
  readonly result = signal<PeppolResponse | null>(null);
  readonly selectedMatch = signal<PeppolMatch | null>(null);
  readonly isPathParticipant = signal(false);
  readonly searchPerformed = signal(false);
  readonly isLoading = signal(false);
  readonly matches = computed(() => this.result()?.matches ?? []);
  readonly totalResults = computed(() => this.result()?.["total-result-count"] ?? 0);
  readonly firstResultIndex = computed(() => (this.result()?.["first-result-index"] ?? 0) + 1);
  readonly lastResultIndex = computed(() => (this.result()?.["last-result-index"] ?? 0) + 1);
  readonly totalPages = computed(() => {
    const effectiveTotal = Math.min(this.totalResults(), MAX_RETURNABLE_RESULTS);
    return Math.max(0, Math.ceil(effectiveTotal / this.pageSize()));
  });
  readonly paginationPages = computed(() =>
    buildPaginationPages(this.currentPage(), this.totalPages()),
  );
  readonly TEXT = TEXT;
  readonly MAX_RETURNABLE_RESULTS = MAX_RETURNABLE_RESULTS;

  europeCountries: Array<{ code: string; name: string }> = [];
  otherCountries: Array<{ code: string; name: string }> = [];
  private pendingSelectedId: string | null = null;

  constructor() {
    this.initCountries();
    this.restoreParticipantFromPath();
    this.connectQueryParams();
    this.connectNavigation();
  }

  search() {
    this.currentPage.set(0);
    this.updateUrl({ push: true });
  }

  clearSearch() {
    this.searchQuery.set("");
    this.currentPage.set(0);
    this.searchPerformed.set(false);
    this.result.set(null);
    this.updateUrl({ push: true });
  }

  goToPage(page: number) {
    this.currentPage.set(page);
    this.updateUrl({ push: true });
  }

  onPageSizeChange() {
    this.currentPage.set(0);
    this.updateUrl({ push: true });
  }

  selectMatch(match: PeppolMatch) {
    this.selectedMatch.set(match);
    const pid = match.participantID?.value ?? null;
    if (!pid) return;
    const from =
      typeof window !== "undefined" ? window.location.pathname + window.location.search : undefined;
    const extras: any = from ? { state: { from } } : {};
    this.router.navigate(["/directory", pid], extras);
    this.isPathParticipant.set(true);
  }

  backToList() {
    this.selectedMatch.set(null);
    if (!this.isPathParticipant()) {
      this.router.navigate(["/directory"]);
      return;
    }
    try {
      this.location.back();
    } catch {
      this.router.navigate(["/directory"]);
    }
    this.isPathParticipant.set(false);
  }

  getCompanyName(match: PeppolMatch): string {
    return match.entities?.[0]?.name?.[0]?.name ?? DEFAULTS.UNKNOWN;
  }

  getCompanyLabel(match: PeppolMatch): string {
    const pid = match.participantID?.value ?? DEFAULTS.UNKNOWN;
    if (!pid || pid === DEFAULTS.UNKNOWN) return this.getCompanyName(match);
    const parsed = this.peppol.parseParticipantId(pid);
    const orgId = parsed.organizationId || pid;
    const reg = parsed.registerName || "";
    return `${orgId}${reg ? " - " + reg : ""}`;
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

  getFlagUrl(countryCode: string) {
    return this.flagCache.getFlagUrl(countryCode);
  }

  private initCountries() {
    const seen = new Set<string>();
    for (const code of EUROPE_ALPHA2) {
      this.europeCountries.push({ code, name: COUNTRY_NAMES[code] || code });
      seen.add(code);
    }
    this.otherCountries = Object.keys(COUNTRY_NAMES)
      .filter((code) => !seen.has(code))
      .map((code) => ({ code, name: COUNTRY_NAMES[code] }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  private restoreParticipantFromPath() {
    try {
      const rawPath = stripBaseHrefFromLocation();
      const segments = rawPath.split("/").filter(Boolean);
      if (segments.length >= 2 && segments[0] === "directory" && /:/.test(segments[1])) {
        this.loadParticipantById(segments[1]);
      }
    } catch {
      return;
    }
  }

  private connectQueryParams() {
    let lastQuery = "";
    let lastCountry = "";
    let lastPage = 0;
    let lastPageSize = DEFAULTS.PAGE_SIZE as number;

    this.route.queryParams.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const nextQuery = params[QUERY_KEYS.Q] || "";
      const nextCountry = params[QUERY_KEYS.COUNTRY] || "";
      const legacyParticipant = params["participant"] || params["selected"] || null;
      if (legacyParticipant && !nextQuery) {
        this.router.navigateByUrl(`/directory/${legacyParticipant}`, { replaceUrl: true });
        return;
      }

      const rawPage = parseInt(params[QUERY_KEYS.RESULT_PAGE_INDEX], 10);
      const nextPage = Number.isNaN(rawPage) ? 0 : Math.max(0, rawPage - 1);
      const nextPageSize = parseInt(params[QUERY_KEYS.RESULT_PAGE_COUNT], 10) || DEFAULTS.PAGE_SIZE;
      const changed =
        nextQuery !== lastQuery ||
        nextCountry !== lastCountry ||
        nextPage !== lastPage ||
        nextPageSize !== lastPageSize;

      this.searchQuery.set(nextQuery);
      this.countryFilter.set(nextCountry);
      this.currentPage.set(nextPage);
      this.pageSize.set(nextPageSize);

      if (changed || !this.result()) {
        lastQuery = nextQuery;
        lastCountry = nextCountry;
        lastPage = nextPage;
        lastPageSize = nextPageSize;
        this.performSearch();
      }
    });
  }

  private connectNavigation() {
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((event) => {
        const nav = event as NavigationEnd;
        try {
          const url = nav.urlAfterRedirects || nav.url || this.router.url || "";
          const stripped = stripBaseHrefFromUrl(url);
          const normalized = stripped.startsWith("/") ? stripped : "/" + stripped;
          const tree = this.router.parseUrl(normalized);
          const primary = tree.root?.children?.["primary"];
          const segments = primary?.segments?.map((seg) => seg.path) ?? [];
          if (segments.length >= 2 && segments[0] === "directory" && /:/.test(segments[1])) {
            this.loadParticipantById(segments[1]);
            return;
          }
          if (segments.length === 1 && segments[0] === "directory") {
            this.selectedMatch.set(null);
            this.pendingSelectedId = null;
            this.isPathParticipant.set(false);
            this.isLoading.set(false);
          }
        } catch {
          return;
        }
      });
  }

  private loadParticipantById(id: string) {
    if (this.selectedMatch()?.participantID?.value === id) return;
    this.pendingSelectedId = id;
    this.isPathParticipant.set(true);
    this.isLoading.set(true);
    this.peppol.fetchParticipant(id).subscribe({
      next: (data) => {
        this.selectedMatch.set(data?.matches?.[0] || null);
        this.pendingSelectedId = null;
        this.isLoading.set(false);
      },
      error: () => {
        this.pendingSelectedId = null;
        this.isLoading.set(false);
      },
    });
  }

  private performSearch() {
    const queryValue = this.searchQuery().trim();
    const countryValue = this.countryFilter();
    if (!queryValue && !countryValue) {
      this.searchPerformed.set(false);
      this.result.set(null);
      this.isLoading.set(false);
      return;
    }

    const params = new URLSearchParams();
    params.append("q", queryValue.replace(/\s+/g, "+"));
    if (countryValue) params.append(QUERY_KEYS.COUNTRY, countryValue);
    params.append(QUERY_KEYS.RESULT_PAGE_INDEX, this.currentPage().toString());
    params.append(QUERY_KEYS.RESULT_PAGE_COUNT, this.pageSize().toString());

    this.isLoading.set(true);
    this.peppol.fetchSearch(params).subscribe({
      next: (data) => {
        this.result.set(data);
        this.searchPerformed.set(true);
        this.applyPendingSelection();
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error("Error fetching data:", err);
        this.searchPerformed.set(true);
        this.result.set(null);
        this.isLoading.set(false);
      },
    });
  }

  private applyPendingSelection() {
    if (!this.pendingSelectedId || !this.result()) return;
    const found =
      this.result()?.matches?.find((m) => m.participantID?.value === this.pendingSelectedId) ||
      null;
    if (found) {
      this.selectedMatch.set(found);
      this.pendingSelectedId = null;
    }
  }

  private updateUrl(opts?: { push?: boolean }) {
    const queryParams = {
      [QUERY_KEYS.Q]: this.searchQuery().trim() ? this.searchQuery() : null,
      [QUERY_KEYS.COUNTRY]: this.countryFilter() || null,
      [QUERY_KEYS.RESULT_PAGE_INDEX]: this.currentPage() + 1,
      [QUERY_KEYS.RESULT_PAGE_COUNT]:
        this.pageSize() !== DEFAULTS.PAGE_SIZE ? this.pageSize() : null,
    } as const;

    const qpObj = Object.fromEntries(
      Object.entries(queryParams).filter(([, value]) => value !== null && value !== undefined),
    );

    const participantId =
      this.selectedMatch()?.participantID?.value || this.pendingSelectedId || null;
    const shouldReplace = opts?.push === false;
    const navigationExtras: any = { replaceUrl: shouldReplace };

    if (!this.searchQuery().trim() && participantId) {
      this.router.navigate(["/directory", participantId], navigationExtras);
      return;
    }

    this.router.navigate(["/directory"], { ...navigationExtras, queryParams: qpObj });
  }
}
