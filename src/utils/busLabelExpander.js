/**
 * Expands EDA/Virtuoso bus label patterns such as:
 * - `a<1:10>` -> ['a<1>', 'a<2>', ..., 'a<10>']
 * - `a[1:10]` -> ['a[1]', 'a[2]', ..., 'a[10]']
 * - `d[7:0]`  -> ['d[7]', 'd[6]', ..., 'd[0]'] (descending order)
 *
 * Supports combinations separated by whitespace:
 * e.g., "clk rst a<1:3> out" -> ['clk', 'rst', 'a<1>', 'a<2>', 'a<3>', 'out']
 */

/**
 * Expands a single token if it matches a bus range syntax.
 * Otherwise returns [token].
 *
 * @param {string} token
 * @returns {string[]}
 */
export function expandBusToken(token) {
  if (!token) return [];
  const trimmed = token.trim();
  if (!trimmed) return [];

  // Match: name<start:end> or name[start:end]
  const angleMatch = trimmed.match(/^([a-zA-Z0-9_\\{}]+)<(\d+):(\d+)>$/);
  if (angleMatch) {
    const [, base, startStr, endStr] = angleMatch;
    const start = parseInt(startStr, 10);
    const end = parseInt(endStr, 10);
    const result = [];
    if (start <= end) {
      for (let i = start; i <= end; i++) {
        result.push(`${base}<${i}>`);
      }
    } else {
      for (let i = start; i >= end; i--) {
        result.push(`${base}<${i}>`);
      }
    }
    return result;
  }

  const squareMatch = trimmed.match(/^([a-zA-Z0-9_\\{}]+)\[(\d+):(\d+)\]$/);
  if (squareMatch) {
    const [, base, startStr, endStr] = squareMatch;
    const start = parseInt(startStr, 10);
    const end = parseInt(endStr, 10);
    const result = [];
    if (start <= end) {
      for (let i = start; i <= end; i++) {
        result.push(`${base}[${i}]`);
      }
    } else {
      for (let i = start; i >= end; i--) {
        result.push(`${base}[${i}]`);
      }
    }
    return result;
  }

  return [trimmed];
}

/**
 * Splits input text by whitespace and expands any bus tokens.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function expandBusLabels(text) {
  if (!text || typeof text !== 'string') return [];
  const rawTokens = text.trim().split(/\s+/).filter(Boolean);
  const expanded = [];
  for (const token of rawTokens) {
    expanded.push(...expandBusToken(token));
  }
  return expanded;
}
