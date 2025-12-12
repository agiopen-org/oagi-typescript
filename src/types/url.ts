export type URL = string;

const UUID_PATTERN = /\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\.[a-z]+)?(?:\?|$)/i;

export const extractUuidFromUrl = (url: string): string | null => {
  const match = UUID_PATTERN.exec(url);
  return match?.[1] ?? null;
};
