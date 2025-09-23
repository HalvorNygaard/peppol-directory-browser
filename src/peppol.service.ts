import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { COUNTRY_NAMES, EAS_CODES } from './app.constants';
import { FLAG, DEFAULTS, TEXT, API_BASE, API_PATH } from './app.config';
import { PeppolResponse } from './peppol.types';

@Injectable({ providedIn: 'root' })
export class PeppolService {
  constructor(private http: HttpClient) {}
  getCountryName(code: string): string {
    if (!code) return code;
    return COUNTRY_NAMES[code] || code;
  }

  getEasDescription(code: string): string {
    return EAS_CODES[code] || TEXT.UNKNOWN_REGISTER;
  }

  getFlagUrl(countryCode: string): string {
    if (!countryCode || countryCode === DEFAULTS.UNKNOWN) {
      return `${FLAG.BASE_URL}/xx.png`;
    }
    return `${FLAG.BASE_URL}/${countryCode.toLowerCase()}.png`;
  }

  parseParticipantId(participantId: string): { registerName: string, organizationId: string } {
    const parts = participantId?.split(':') || [];
    if (parts.length !== 2) {
      return { registerName: DEFAULTS.UNKNOWN, organizationId: participantId };
    }
    const registerId = parts[0];
    const organizationId = parts[1];
    const registerName = this.getEasDescription(registerId);
    return { registerName, organizationId };
  }

  // Unwrap responses coming from public CORS proxies (like AllOrigins).
  // The proxy returns JSON shaped like: { contents: "<stringified original>", status: {...} }
  // This method accepts either the original object or the wrapper and returns
  // the original parsed object. It is intentionally decoupled so the rest of
  // the app doesn't need to know about the proxy implementation.
  unwrapProxyResponse<T>(maybeWrapped: any): T {
    if (!maybeWrapped) return maybeWrapped as T;
    // Detect AllOrigins wrapper and return parsed original payload.
    if (typeof maybeWrapped.contents === 'string' && maybeWrapped.status) {
      try {
        return JSON.parse(maybeWrapped.contents) as T;
      } catch {
        return maybeWrapped as T;
      }
    }
    return maybeWrapped as T;
  }

  // Detect whether the app is running on a local dev origin.
  isLocalOrigin(): boolean {
    try {
      const loc = window.location.origin;
      return loc.startsWith('http://localhost') || loc.startsWith('http://127.0.0.1') || loc.startsWith('https://localhost') || loc.startsWith('https://127.0.0.1');
    } catch (e) {
      return false;
    }
  }

  // Build the search URL, routing through a public CORS proxy when not local.
  buildSearchUrl(params: URLSearchParams): string {
    const paramsStr = params.toString();
    if (!this.isLocalOrigin()) {
      const direct = `${API_BASE}?${paramsStr}`;
      return `https://api.allorigins.win/get?url=${encodeURIComponent(direct)}`;
    }
  // Local dev: return a same-origin path (API_PATH) so the Angular dev-server
  // proxy (configured in proxy.conf.json) can forward the request to the upstream API.
  return `${API_PATH}?${paramsStr}`;
  }

  // Fetch search results and return a typed observable with unwrapped body.
  fetchSearch(params: URLSearchParams): Observable<PeppolResponse> {
    // Add a tiny cache-bust to avoid intermediate caches returning stale data.
    try { params.append('_ts', Date.now().toString()); } catch (e) {}
    const url = this.buildSearchUrl(params);
    const headers = new HttpHeaders({ 'Accept': 'application/json', 'Cache-Control': 'no-store', 'Pragma': 'no-cache' });
    return this.http.get<any>(url, { headers }).pipe(
      map(raw => this.unwrapProxyResponse<PeppolResponse>(raw))
    );
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
    let normalized = participantId || '';
    const hasScheme = /::/.test(normalized) || /^[a-z0-9-]+::/i.test(normalized);
    if (!hasScheme && normalized) {
      normalized = `iso6523-actorid-upis::${normalized}`;
    }
    params.append('participant', normalized);
    // cache-bust
    try { params.append('_ts', Date.now().toString()); } catch (e) {}
    const url = this.buildSearchUrl(params);
    const headers = new HttpHeaders({ 'Accept': 'application/json', 'Cache-Control': 'no-store', 'Pragma': 'no-cache' });
    return this.http.get<any>(url, { headers }).pipe(
      map(raw => this.unwrapProxyResponse<PeppolResponse>(raw))
    );
  }
}
