/** A failed model call must still leave a new YAI conversation identifiable. */
export function getYaiTitleFallback(text: string): string {
  const normalized = text.replace(/\s+/gu, ' ').trim();
  if (!normalized) return 'Attachment discussion';
  const characters = Array.from(normalized);
  return characters.length > 80 ? `${characters.slice(0, 79).join('').trimEnd()}…` : normalized;
}
