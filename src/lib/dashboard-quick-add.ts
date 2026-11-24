// Quick add accepts one destination, not an arbitrary navigation URL.
export function dashboardReturn(value: unknown): "/" | undefined {
  return value === "/" ? "/" : undefined;
}

// Preserve existing contextual task returns while validating the normalized
// destination, including traversal/encoding attempts, before navigation.
export function taskReturn(value: string | null): string {
  if (dashboardReturn(value)) return "/";
  if (!value || value.length > 2048 || !value.startsWith("/") || value.startsWith("//"))
    return "/todos";
  try {
    const decoded = decodeURI(value);
    if (/[\\\u0000-\u001f\u007f]/.test(decoded)) return "/todos";
    const url = new URL(decoded, "https://dashboard.invalid");
    if (
      url.origin === "https://dashboard.invalid" &&
      /^\/(todos|my-work|projects|events|knowledge)(?:\/|$)/.test(url.pathname)
    )
      return value;
  } catch {
    // Malformed return values fall back to the existing work list.
  }
  return "/todos";
}
