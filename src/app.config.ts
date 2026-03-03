const API_BASE_URL = "https://peppol-proxy.halvor-nygaard.workers.dev";
const LOCAL_API_BASE = "/api/search/1.0/json";

export const API_BASE = (() => {
  if (typeof window === "undefined") return API_BASE_URL;
  const host = window.location.hostname;
  const isLocalhost = host === "localhost" || host === "127.0.0.1";
  return isLocalhost ? LOCAL_API_BASE : API_BASE_URL;
})();

import { DEFAULT_PAGE_SIZE } from "./design.tokens";

export const DEFAULTS = {
  PAGE_SIZE: DEFAULT_PAGE_SIZE,
  UNKNOWN: "N/A",
};

export const TEXT = {
  UNKNOWN_REGISTER: "Unknown Register",
  APP_TITLE: "Peppol Directory Search",
  ALL_COUNTRIES: "All Countries",
  RESULTS_PER_PAGE: "Results per page:",
  NO_RESULTS: "No results found",
  NO_DOCUMENT_TYPES: "No document types available",
  CLEAR_COUNTRY: "Clear country filter",
  WEBSITES: "Websites",
};
export const LABELS = {
  ORGANIZATION_ID: "Organization ID",
  REGISTER: "Register",
  COUNTRY: "Country",
  REGISTERED: "Date Registered",
};
// add specific UI keys below if needed

export const QUERY_KEYS = {
  Q: "q",
  COUNTRY: "country",
  RESULT_PAGE_INDEX: "rpi",
  RESULT_PAGE_COUNT: "rpc",
};

export const FLAG = {
  BASE_URL: "https://flagcdn.com/w20",
} as const;

// Some upstream search services cap the number of returnable results
// (commonly 1000). Use this constant in the client to avoid showing
// unreachable trailing pages when the API advertises a larger total.
export const MAX_RETURNABLE_RESULTS = 1000;
