/**
 * Model IDs recognized by the installed @anthropic-ai/sdk version, extracted
 * directly from its own type definitions
 * (node_modules/@anthropic-ai/sdk/resources/messages/messages.d.ts) so this
 * list can't silently drift from what the installed SDK actually supports.
 * Re-derive this list (grep the SDK's .d.ts for the model union) whenever
 * @anthropic-ai/sdk is upgraded.
 */
export const SUPPORTED_ANTHROPIC_MODELS = [
  'claude-fable-5',
  'claude-haiku-4-5',
  'claude-haiku-4-5-20251001',
  'claude-mythos-5',
  'claude-mythos-preview',
  'claude-opus-4-1',
  'claude-opus-4-1-20250805',
  'claude-opus-4-5',
  'claude-opus-4-5-20251101',
  'claude-opus-4-6',
  'claude-opus-4-7',
  'claude-opus-4-8',
  'claude-sonnet-4-5',
  'claude-sonnet-4-5-20250929',
  'claude-sonnet-4-6',
  'claude-sonnet-5',
] as const;

export type SupportedAnthropicModel = (typeof SUPPORTED_ANTHROPIC_MODELS)[number];

/** Claude Opus 4.8: the current most-capable Opus-tier model as of this SDK version. */
export const DEFAULT_ANTHROPIC_MODEL: SupportedAnthropicModel = 'claude-opus-4-8';

export class UnsupportedAnthropicModelError extends Error {
  constructor(model: string) {
    super(
      `ANTHROPIC_MODEL is set to "${model}", which the installed @anthropic-ai/sdk version does not ` +
        `recognize. Supported values: ${SUPPORTED_ANTHROPIC_MODELS.join(', ')}. Unset ANTHROPIC_MODEL to ` +
        `use the default (${DEFAULT_ANTHROPIC_MODEL}), or set it to one of the values listed above.`
    );
    this.name = 'UnsupportedAnthropicModelError';
  }
}

/**
 * Resolves and validates the model used for AI reasoning. Throws
 * UnsupportedAnthropicModelError for an unrecognized value — call this
 * eagerly (module load time) wherever Claude is actually going to be used,
 * so a typo'd ANTHROPIC_MODEL fails immediately and clearly rather than
 * producing a confusing 404 from the Anthropic API deep in a background job.
 */
export function resolveAnthropicModel(): SupportedAnthropicModel {
  const configured = process.env.ANTHROPIC_MODEL?.trim();
  if (!configured) return DEFAULT_ANTHROPIC_MODEL;

  if (!(SUPPORTED_ANTHROPIC_MODELS as readonly string[]).includes(configured)) {
    throw new UnsupportedAnthropicModelError(configured);
  }
  return configured as SupportedAnthropicModel;
}
