import { Injectable } from "@angular/core";
import { HttpClient, HttpHeaders } from "@angular/common/http";
import { Observable } from "rxjs";
import { COUNTRY_NAMES, EAS_CODES } from "./app.constants";
import { FLAG, DEFAULTS, TEXT, API_BASE } from "./app.config";
import { PeppolResponse } from "./peppol.types";

@Injectable({ providedIn: "root" })
export class PeppolService {
  private readonly flagUrlCache = new Map<string, string>();

  constructor(private http: HttpClient) {}
  getCountryName(code: string): string {
    if (!code) return code;
    return COUNTRY_NAMES[code] || code;
  }

  getEasDescription(code: string): string {
    return EAS_CODES[code] || TEXT.UNKNOWN_REGISTER;
  }

  getFlagUrl(countryCode: string): string {
    const normalized = (countryCode || "").trim().toUpperCase();
    const cacheKey = normalized && normalized !== DEFAULTS.UNKNOWN ? normalized : "XX";
    const cached = this.flagUrlCache.get(cacheKey);
    if (cached) return cached;
    const url = cacheKey === "XX" ? `${FLAG.BASE_URL}/xx.png` : `${FLAG.BASE_URL}/${cacheKey.toLowerCase()}.png`;
    this.flagUrlCache.set(cacheKey, url);
    return url;
  }

  parseParticipantId(participantId: string): { registerName: string; organizationId: string } {
    const parts = participantId?.split(":") || [];
    if (parts.length !== 2) {
      return { registerName: DEFAULTS.UNKNOWN, organizationId: participantId };
    }
    const registerId = parts[0];
    const organizationId = parts[1];
    const registerName = this.getEasDescription(registerId);
    return { registerName, organizationId };
  }

  private buildSearchUrl(params: URLSearchParams): string {
    const paramsStr = params.toString();
    return `${API_BASE}?${paramsStr}`;
  }

  // Fetch search results and return a typed observable with unwrapped body.
  fetchSearch(params: URLSearchParams): Observable<PeppolResponse> {
    // Add a tiny cache-bust to avoid intermediate caches returning stale data.
    try {
      params.append("_ts", Date.now().toString());
    } catch {}
    const url = this.buildSearchUrl(params);
    const headers = new HttpHeaders({
      Accept: "application/json",
      "Cache-Control": "no-store",
      Pragma: "no-cache",
    });

    return this.http.get<PeppolResponse>(url, { headers });
  }

  /**
   * Fetch a single participant using the participant query param.
   * Example: search/1.0/json?participant=iso6523-actorid-upis::<orgid>:<register>
   */
  fetchParticipant(participantId: string): Observable<PeppolResponse> {
    const params = new URLSearchParams();
    // Some callers pass short form ids like '0192:922205426'. The upstream
    // API expects a scheme-qualified identifier such as
    // 'iso6523-actorid-upis::0192:922205426'. Detect simple ids and
    // prepend the common Peppol actorid scheme when missing.
    let normalized = participantId || "";
    const hasScheme = /::/.test(normalized) || /^[a-z0-9-]+::/i.test(normalized);
    if (!hasScheme && normalized) {
      normalized = `iso6523-actorid-upis::${normalized}`;
    }
    params.append("participant", normalized);
    // cache-bust
    try {
      params.append("_ts", Date.now().toString());
    } catch {}
    const url = this.buildSearchUrl(params);
    const headers = new HttpHeaders({
      Accept: "application/json",
      "Cache-Control": "no-store",
      Pragma: "no-cache",
    });

    return this.http.get<PeppolResponse>(url, { headers });
  }
}
