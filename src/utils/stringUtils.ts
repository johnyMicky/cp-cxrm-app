export const safeLower = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  return String(value).toLowerCase();
};

export const safeIncludes = (value: unknown, searchTerm: string): boolean => {
  const safeValue = safeLower(value);
  const safeSearch = safeLower(searchTerm);
  return safeValue.includes(safeSearch);
};
