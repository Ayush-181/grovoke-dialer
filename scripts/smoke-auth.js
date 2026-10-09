async (page) => {
  const origin = "http://127.0.0.1:4173";
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const context = page.context();
  // Routes are installed on a blank isolated session BEFORE any navigation.
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const safePath =
      ["/", "/auth", "/favicon.ico", "/@react-refresh", "/@tanstack-start/styles.css"].includes(
        url.pathname,
      ) || /^\/(?:src|node_modules|@vite|@id|@fs)\//.test(url.pathname);
    if (
      url.origin === origin &&
      request.method() === "GET" &&
      safePath &&
      !url.pathname.includes("..")
    )
      return route.continue();
    return route.abort("blockedbyclient");
  });
  // No Twilio signaling or Vite HMR websocket connections.
  await context.routeWebSocket("**/*", (socket) => socket.close());
  await page.goto(origin + "/auth", { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "CALL BOARD", exact: true }).waitFor();
  await page.getByLabel("Email", { exact: true }).waitFor();
  await page.getByLabel("Password", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Sign in", exact: true }).waitFor();
  const createAccount = page.getByRole("button", { name: "Create account", exact: true });
  // SSR controls can be visible before React has attached interaction handlers.
  // Retry only this non-submitting mode switch while hydration completes.
  for (let attempt = 0; attempt < 10 && !(await createAccount.isVisible()); attempt++) {
    if (errors.length) throw new Error("Hydration failed: " + errors.join("; "));
    await page.getByRole("button", { name: "No account? Create one", exact: true }).click();
    await createAccount.waitFor({ timeout: 1000 }).catch(() => {});
  }
  await createAccount.waitFor({ timeout: 1000 });
  await page.getByRole("button", { name: "Already have an account? Sign in", exact: true }).click();
  // Never fill credentials or submit either form.
  for (const width of [1280, 768, 390]) {
    await page.setViewportSize({ width, height: 800 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    if (overflow) throw new Error("Auth page overflows at " + width + "px");
    await page.screenshot({ path: ".playwright-cli/auth-" + width + ".png" });
  }
  if (errors.length) throw new Error("Browser page errors: " + errors.join("; "));
  console.log("PASS: anonymous auth controls, mode toggle, responsive widths; no form submission.");
};
