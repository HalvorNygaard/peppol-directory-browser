export interface Identifier { value: string; scheme?: string }

export interface NameEntry { name?: string; value?: string; language?: string }

export interface ContactEntry { type?: string; name?: string; phone?: string; email?: string }

export interface EntityEntry {
  name?: NameEntry[];
  countryCode?: string;
  geoInfo?: string;
  identifier?: Identifier[];
  identifiers?: Identifier[];
  website?: string[] | string;
  websites?: string[] | string;
  contact?: ContactEntry[];
  contacts?: ContactEntry[];
  additionalInfo?: string;
  regDate?: string;
}

export interface DocTypeEntry { scheme?: string; value?: string }

export interface ParticipantId { scheme?: string; value?: string }

export interface PeppolMatch {
  participantID?: ParticipantId;
  docTypes?: DocTypeEntry[];
  entities?: EntityEntry[];
}

export interface PeppolResponse {
  version?: string;
  'total-result-count'?: number;
  'used-result-count'?: number;
  'result-page-index'?: number;
  'result-page-count'?: number;
  'first-result-index'?: number;
  'last-result-index'?: number;
  'query-terms'?: string;
  'creation-dt'?: string;
  matches?: PeppolMatch[];
}

export type PeppolMatchType = PeppolMatch;
