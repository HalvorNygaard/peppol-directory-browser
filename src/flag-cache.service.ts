import { Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable, catchError, map, of, shareReplay } from "rxjs";

import { DEFAULTS, FLAG } from "./app.config";

@Injectable({ providedIn: "root" })
export class FlagCacheService {
  private readonly cache = new Map<string, Observable<string>>();

  constructor(private readonly http: HttpClient) {}

  getFlagUrl(countryCode: string): Observable<string> {
    const normalized = (countryCode || "").trim().toUpperCase();
    const cacheKey = normalized && normalized !== DEFAULTS.UNKNOWN ? normalized : "XX";
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const directUrl = this.buildUrl(cacheKey);
    const request$ = this.http.get(directUrl, { responseType: "blob" }).pipe(
      map((blob) => URL.createObjectURL(blob)),
      catchError(() => of(directUrl)),
      shareReplay({ bufferSize: 1, refCount: false })
    );

    this.cache.set(cacheKey, request$);
    return request$;
  }

  private buildUrl(code: string): string {
    if (code === "XX") return `${FLAG.BASE_URL}/xx.png`;
    return `${FLAG.BASE_URL}/${code.toLowerCase()}.png`;
  }
}
