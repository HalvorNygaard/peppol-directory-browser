const PAGE_WINDOW = 5;

export function buildPaginationPages(currentPage: number, totalPages: number): number[] {
  if (totalPages <= 1) return [];
  const pages: number[] = [];
  const windowSize = Math.min(PAGE_WINDOW, totalPages);
  const half = Math.floor(windowSize / 2);
  let start = currentPage - half;
  start = Math.max(0, Math.min(start, totalPages - windowSize));
  for (let i = start; i < start + windowSize; i += 1) pages.push(i);
  return pages;
}
