import { Component, Input, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PeppolMatch, EntityEntry, Identifier, ContactEntry, DocTypeEntry } from './peppol.types';
import { PeppolService } from './peppol.service';
import { DEFAULTS, TEXT, LABELS } from './app.config';

/** Precomputed display model for a document type entry */
interface DocDisplay {
  rawValue: string;
  title: string; // e.g. Invoice
  scheme: string; // cleaned scheme for display
  subtitle: string; // cleaned customization/spec for display
  originalScheme: string; // original raw scheme for tooltip
  originalCustomization: string; // original raw customization for tooltip
  versionTooltip: string; // e.g. "Invoice UBL 2.1"
}

@Component({
  selector: 'app-details',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './details.component.html',
  styleUrls: ['./details.component.css']
})
export class DetailsComponent {
  private readonly peppol = inject(PeppolService);

  private _match: PeppolMatch | null = null;
  parsedParticipant: { registerName: string; organizationId: string } = { registerName: DEFAULTS.UNKNOWN, organizationId: DEFAULTS.UNKNOWN };
  readonly TEXT = TEXT;
  readonly LABELS = LABELS;
  readonly DEFAULTS = DEFAULTS;
  // Normalized entity view-model used by the template for safe, simple reads
  normalizedEntities: Array<{
    raw: EntityEntry;
    primaryName: string;
    otherNames: Array<{ value: string; language?: string }>;
    countryCode: string;
    countryName: string;
    geoInfo?: string;
    identifiers: Identifier[];
    identifiersFormatted: string[];
    contacts: ContactEntry[];
    websites: Array<{ href: string; text: string }>;
    additionalInfo?: string;
    regDate?: string;
    flagUrl?: string;
  }> = [];

  @Input()
  set match(value: PeppolMatch | null) {
    this._match = value;
    const id = this._match?.participantID?.value ?? DEFAULTS.UNKNOWN;
    this.parsedParticipant = this.peppol.parseParticipantId(id);
    // build normalized entities to simplify template logic and handle optional fields
    this.normalizedEntities = (this._match?.entities ?? []).map((e: any) => {
      const names = this.getEntityNames(e);
      const primaryName = names.length ? names[0].value : DEFAULTS.UNKNOWN;
      const otherNames = names.slice(1);
      const identifiers = this.getIdentifiers(e);
      const identifiersFormatted = identifiers.map((id: any) => this.formatIdentifier(id));
  const contacts = this.getContacts(e);
  const rawWebsites = e.websites || e.website || [];
  const websites = (Array.isArray(rawWebsites) ? rawWebsites : [rawWebsites])
    .map((w: any) => this.normalizeWebsite(w))
    .filter((x: any): x is { href: string; text: string } => !!x);
      const countryCode = e.countryCode || '';
      return {
        raw: e,
        primaryName,
        otherNames,
        countryCode,
        countryName: this.getCountryName(countryCode),
        geoInfo: e.geoInfo,
        identifiers,
        identifiersFormatted,
        contacts,
  websites,
        additionalInfo: e.additionalInfo,
        regDate: e.regDate,
        flagUrl: this.getFlagUrl(countryCode)
      };
    });
  }

  /** Normalize a website entry into { href, text } */
  normalizeWebsite(w: any): { href: string; text: string } | null {
    if (!w) return null;
    if (typeof w === 'string') {
      const href = this.ensureHref(w);
      return { href, text: w };
    }
    // handle common object shapes
    const raw = w.href || w.url || w.value || w.uri || w.link || '';
    const text = w.text || w.label || w.value || raw || '';
    if (!raw) return null;
    return { href: this.ensureHref(raw), text };
  }

  /** Ensure href has a usable scheme; default to https:// when missing */
  ensureHref(href: string): string {
    if (!href) return href;
    const trimmed = String(href).trim();
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return trimmed; // already has scheme (http:, https:, mailto:, tel:...)
    return 'https://' + trimmed.replace(/^\/\//, '');
  }

  get match(): PeppolMatch | null {
    return this._match;
  }

  @Output() back = new EventEmitter<void>();

  getCompanyName(): string {
    return this.match?.entities?.[0]?.name?.[0]?.name ?? DEFAULTS.UNKNOWN;
  }

  getCountryName(code: string): string {
    return this.peppol.getCountryName(code);
  }

  /** Returns the first entity's country code (used by header/meta) */
  getCountryCode(): string {
    return this.match?.entities?.[0]?.countryCode ?? DEFAULTS.UNKNOWN;
  }

  /** Return the entities array — components should iterate over this */
  getEntities() {
    return this.normalizedEntities;
  }

  getParticipantId(): string {
    return this._match?.participantID?.value ?? DEFAULTS.UNKNOWN;
  }

  parseParticipantId(participantId: string): { registerName: string, organizationId: string } {
    return this.peppol.parseParticipantId(participantId);
  }

  /** Normalize and return the list of names for an entity. Handles both {name} and {value, language} shapes. */
  getEntityNames(entity: EntityEntry | any): Array<{ value: string; language?: string }> {
    const raw = entity?.name ?? [];
    return Array.isArray(raw)
      ? raw.map((n: any) => ({ value: n.value ?? n.name ?? '', language: n.language ?? n.lang }))
      : [];
  }

  /** Return identifiers list for an entity (value + optional scheme) */
  getIdentifiers(entity: EntityEntry | any): Identifier[] {
    const raw = entity?.identifier ?? entity?.identifiers ?? [];
    return Array.isArray(raw) ? raw.map((i: any) => ({ value: i.value ?? '', scheme: i.scheme })) : [];
  }

  /** Return contacts array (defensive) */
  getContacts(entity: EntityEntry | any): ContactEntry[] {
    return Array.isArray(entity?.contact) ? entity.contact : Array.isArray(entity?.contacts) ? entity.contacts : [];
  }

  /**
   * Prepare a human-friendly contact display object.
   * Returns: { displayName, roleLabel, phoneHref, phoneDisplay, emailHref, emailDisplay }
   */
  formatContact(c: any) {
    if (!c) return null;
  const roleLabel = c.type ? (c.type.charAt(0).toUpperCase() + c.type.slice(1)) : '';
  const displayName = c.name || '';
  // compactLabel: prefer name, fall back to roleLabel (e.g., 'Office Contact Point')
  const compactLabel = displayName || roleLabel || '';
    const phoneHref = c.phone ? `tel:${c.phone.replace(/\s+/g, '')}` : '';
    const phoneDisplay = c.phone || '';
    const emailHref = c.email ? `mailto:${c.email}` : '';
    const emailDisplay = c.email || '';
    return { displayName, roleLabel, compactLabel, phoneHref, phoneDisplay, emailHref, emailDisplay };
  }

  /** Format an identifier object to '<value-without-prefix> - <human description>' when possible */
  formatIdentifier(id: any): string {
    if (!id) return '';
    const raw = id.value ?? '';
    // if value uses a prefix like '0196:7003100270', extract both parts
    if (raw.includes(':')) {
      const [prefix, rest] = raw.split(':', 2);
      const desc = this.peppol.getEasDescription(prefix) || this.peppol.getEasDescription(prefix);
      return `${rest || raw} - ${desc || prefix}`;
    }
    // fallback: if scheme appears to be an EAS code, try to use that
    if (id.scheme && /^\d{4}$/.test(id.scheme)) {
      const desc = this.peppol.getEasDescription(id.scheme);
      return `${raw} - ${desc || id.scheme}`;
    }
    // otherwise show value and scheme if present
    return id.scheme ? `${raw} - ${id.scheme}` : raw;
  }

  getFlagUrl(countryCode: string): string {
    return this.peppol.getFlagUrl(countryCode);
  }

  onBack() {
    // navigate browser history first so Back button / mouse back works naturally
    try {
      history.back();
    } catch (e) {
      // if history.back() is not available, fall back to emitting event
      this.back.emit();
    }
  }

  // --- Document id parsing / formatting ---
  formatDocDisplay(docId: string): { title: string; scheme: string; subtitle: string; originalScheme: string; originalCustomization: string; versionTooltip: string } {
    const parsed = this.parsePeppolDocId(docId);
  if (!parsed) return { title: docId, scheme: '', subtitle: '', originalScheme: '', originalCustomization: '', versionTooltip: '' };
    const version = parsed.version || '';
    const title = parsed.rootElement;
    // tooltip should include the document type plus UBL version, e.g. "Invoice UBL 2.1"
    const versionTooltip = version ? `${title} UBL ${version}` : '';
    // Remove leading 'urn:' from scheme and customizationId for cleaner display
    const originalScheme = parsed.rootSchema || '';
    let scheme = originalScheme.replace(/^urn:/i, '');
  // Strip the long UBL prefix when present
  scheme = scheme.replace(/^oasis:names:specification:ubl:schema:xsd:/i, '');
  // Also strip common UN/UNECE UNCEFACT prefix patterns like
  // 'un:unece:uncefact:data:standard:<schema>' (with optional leading 'urn:')
  scheme = scheme.replace(/^(?:urn:)?un:unece:uncefact:data:standard:/i, '');
  const originalCustomization = parsed.customizationId || '';
  // Build a cleaned subtitle for display: remove the EN16931 compliant
  // wrapper when present (handle cases with or without a leading 'urn:'),
  // then strip any remaining leading 'urn:'. Keep originalCustomization
  // untouched for the tooltip.
  // Clean the visible subtitle in a single-step: remove an optional leading
  // 'urn:' and remove an optional EN16931 wrapper (with or without inner
  // 'urn:') in one regex. Keep the originalCustomization for tooltip.
  // Allow any token (e.g. 'compliant' or 'conformant') between the hashes
  let subtitle = (originalCustomization || '').replace(/^(?:urn:)?(?:cen\.eu:en16931:2017#[^#]+#)?(?:urn:)?/i, '');
    return { title, scheme, subtitle, originalScheme, originalCustomization, versionTooltip };
  }

  parsePeppolDocId(docId: string): { rootSchema: string; rootElement: string; customizationId: string; version: string } | null {
    if (!docId) return null;
    const [schemaAndElement, customizationAndVersion] = docId.split('##');
    if (!schemaAndElement || !customizationAndVersion) return null;
    const [rootSchema, rootElement] = schemaAndElement.split('::');
    if (!rootSchema || !rootElement) return null;
    const [customizationId, version] = customizationAndVersion.split('::');
    if (!customizationId || !version) return null;
    return { rootSchema, rootElement, customizationId, version };
  }

  /** Return docTypes sorted by rootElement, then customizationId */
  getSortedDocTypes() {
    const list = this._match?.docTypes ?? [];
    return (Array.isArray(list) ? list.slice() : []).sort((a: any, b: any) => {
      const pa = this.parsePeppolDocId(a.value) || { rootElement: '', customizationId: '' };
      const pb = this.parsePeppolDocId(b.value) || { rootElement: '', customizationId: '' };
      const e = (pa.rootElement || '').localeCompare(pb.rootElement || '');
      if (e !== 0) return e;
      return (pa.customizationId || '').localeCompare(pb.customizationId || '');
    });
  }

  /** Return precomputed DocDisplay objects for the template (sorted) */
  getDocDisplays(): DocDisplay[] {
    const list = this.getSortedDocTypes();
    if (!Array.isArray(list)) return [];
    return list.map((d: any) => {
      const raw = d?.value || '';
      const fd = this.formatDocDisplay(raw);
      return {
        rawValue: raw,
        title: fd.title || raw,
        scheme: fd.scheme || '',
        subtitle: fd.subtitle || '',
        originalScheme: fd.originalScheme || '',
        originalCustomization: fd.originalCustomization || '',
        versionTooltip: fd.versionTooltip || ''
      } as DocDisplay;
    });
  }
}
