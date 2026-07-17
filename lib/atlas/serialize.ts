/** Every tool executor's return value passes through this before going to
 * Claude (as tool_result content) or into ChatMessage.toolCalls (a Json
 * column) — round-tripping through JSON turns Dates into ISO strings and
 * Prisma Decimals into plain numbers/strings, the same normalization
 * lib/jobs/generateBriefing.ts already relies on for its own Json columns. */
export function toJsonSafe<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value));
}
