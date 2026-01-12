/**
 * Returns a sanitized and trimmed GraphQL query string.
 *
 * @param strings An array of string literals for the query.
 * @param params The parameters for the query, if any.
 * @returns The sanitized and trimmed GraphQL query string.
 */
export function gqlcompat(strings: TemplateStringsArray, ...params: string[]) {
  let value = strings[0] || "";

  for (let i = 1; i < strings.length; i++) {
    value += params[i - 1] + (strings[i] || "");
  }

  const ret = value.indexOf('"') === -1 ? value.replace(/[\s,]+/g, " ").trim() : value;

  // Log an error if the query contains undefined values
  if (ret.indexOf("undefined") >= 0) {
    console.error("gql error", arguments, strings, params, ret);
  }

  return ret;
}

/**
 * This function is intended for use with GraphQL Code Generator only.
 * It should NOT be used at runtime.
 *
 * To use GraphQL queries with type safety:
 * 1. Move your gql template into an unreferenced file (e.g., {file}.queries.ts)
 * 2. Run GraphQL Code Generator to generate typed documents
 * 3. Import and use the generated document from the generated types file
 *
 * @throws Always throws an error directing users to use codegen properly
 */
export function gql(strings: TemplateStringsArray, ...params: string[]): void {
  throw new Error(
    "The gql function should not be called at runtime. " +
      "Move your gql template into an unreferenced file such as {file}.queries.ts " +
      "and reference the generated document instead.",
  );
}
