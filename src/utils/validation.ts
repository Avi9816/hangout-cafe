export function isValidString(val: any, minLen = 1, maxLen = 500): boolean {
  if (typeof val !== 'string') return false;
  const trimmed = val.trim();
  if (trimmed.length < minLen || trimmed.length > maxLen) return false;
  
  const lower = trimmed.toLowerCase();
  if (lower === 'undefined' || lower === 'nan' || lower === 'invalid date' || lower === 'null') {
    return false;
  }
  return true;
}
