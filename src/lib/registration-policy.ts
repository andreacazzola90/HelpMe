export function localRegistrationAllowed(environment: string | undefined, configuredUrl: string, requestUrl: string) {
  try {
    const configured = new URL(configuredUrl);
    const request = new URL(requestUrl);
    return environment === "development" && ["localhost", "127.0.0.1", "[::1]"].includes(configured.hostname)
      && request.origin === configured.origin;
  } catch { return false; }
}

export function registrationEmail(input: string, configured: string | undefined, localAllowed: boolean) {
  const email = input.trim().toLowerCase();
  const allowed = configured?.trim().toLowerCase();
  return allowed ? (email === allowed ? email : null) : localAllowed ? email : null;
}