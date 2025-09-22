export const API_BASE = 'https://directory.peppol.eu/search/1.0/json';

import { DEFAULT_PAGE_SIZE } from './design.tokens';

export const DEFAULTS = {
  PAGE_SIZE: DEFAULT_PAGE_SIZE,
  UNKNOWN: 'N/A'
};

export const TEXT = {
  UNKNOWN_REGISTER: 'Unknown Register',
  APP_TITLE: 'Peppol Directory Search',
  ALL_COUNTRIES: 'All Countries',
  RESULTS_PER_PAGE: 'Results per page:',
  NO_RESULTS: 'No results found',
  NO_DOCUMENT_TYPES: 'No document types available',
  CLEAR_COUNTRY: 'Clear country filter',
  WEBSITES: 'Websites'
};
export const LABELS = {
  ORGANIZATION_ID: 'Organization ID',
  REGISTER: 'Register',
  COUNTRY: 'Country',
  REGISTERED: 'Date Registered'
};
// add specific UI keys below if needed

export const QUERY_KEYS = {
  Q: 'q',
  COUNTRY: 'country',
  SELECTED: 'selected',
  RESULT_PAGE_INDEX: 'rpi',
  RESULT_PAGE_COUNT: 'rpc'
};

export const FLAG = {
  BASE_URL: 'https://flagcdn.com/w20'
} as const;
