// Where to go after signing in — the page the user was on when the session ran out
// (e.g. opened from a notification or the morning digest). sessionStorage: per tab.

const RETURN_KEY = "afterLogin";

/** Remember where the user was (e.g. a notification/digest link) so login can bring them back */
export function rememberReturnPath() {
  const path = window.location.pathname + window.location.search;
  if (path !== "/" && !path.startsWith("/login")) sessionStorage.setItem(RETURN_KEY, path);
}

/** The remembered page (same-site paths only), cleared once read */
export function takeReturnPath(): string {
  const p = sessionStorage.getItem(RETURN_KEY);
  sessionStorage.removeItem(RETURN_KEY);
  return p && p.startsWith("/") && !p.startsWith("//") ? p : "/";
}
