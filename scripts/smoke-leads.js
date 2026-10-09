async (page) => {
  const origin = "http://127.0.0.1:4173";
  const provider = "http://127.0.0.1:9";
  const errors = [];
  const forbidden = [];
  const context = page.context();
  page.on("pageerror", (error) => errors.push(error.message));
  const user = {
    id: "11111111-1111-4111-8111-111111111111",
    email: "ash@example.invalid",
    aud: "authenticated",
    role: "authenticated",
    app_metadata: {},
    user_metadata: {},
    created_at: "2026-01-01T00:00:00Z",
  };
  const workspace = {
    id: "22222222-2222-4222-8222-222222222222",
    owner_id: user.id,
    name: "Synthetic workspace with a deliberately long name for layout review",
  };
  const leads = [
    { id: "lead-one", business_name: "Harborview Car Rental", outcome: null, call_count: 0 },
    {
      id: "lead-two",
      business_name: "Northstar Business with a deliberately long contact name",
      outcome: "no_answer",
      call_count: 3,
    },
  ].map((lead, index) => ({
    ...lead,
    workspace_id: workspace.id,
    status: "new",
    phone: `+1212555010${index}`,
    phone_normalized: `+1212555010${index}`,
    city: "New York",
    state: "NY",
    owner_name: "Synthetic contact",
    created_at: "2026-01-01T00:00:00Z",
  }));
  let state = "ready";
  let leadRequests = 0;
  // Only this unused local endpoint is mocked; no real provider request can escape.
  // Install both guards and synthetic session BEFORE navigation.
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (!["GET", "HEAD"].includes(request.method())) {
      forbidden.push(`${request.method()} ${url.pathname}`);
      return route.abort("blockedbyclient");
    }
    if (url.origin === provider) {
      let body;
      let count = 0;
      let status = 200;
      if (url.pathname === "/auth/v1/user") body = user;
      else if (url.pathname === "/rest/v1/workspace_members") {
        body = [{ workspace_id: workspace.id, workspaces: workspace }];
      } else if (url.pathname === "/rest/v1/user_preferences") body = [];
      else if (url.pathname === "/rest/v1/dial_call_logs" && request.method() === "HEAD") body = [];
      else if (url.pathname === "/rest/v1/leads") {
        leadRequests++;
        await new Promise((resolve) => setTimeout(resolve, 250));
        if (state === "error") {
          status = 400;
          body = { message: "Synthetic unavailable response" };
        } else {
          body =
            state === "empty"
              ? []
              : leads.filter((lead) => {
                  if (url.searchParams.get("outcome") === "is.null" && lead.outcome !== null)
                    return false;
                  if (url.searchParams.get("or")?.includes("%missing%")) return false;
                  return true;
                });
          count = body.length;
        }
      } else {
        forbidden.push(`Unexpected mock read ${url.pathname}`);
        return route.abort("blockedbyclient");
      }
      return route.fulfill({
        status,
        contentType: "application/json",
        body: request.method() === "HEAD" ? "" : JSON.stringify(body),
        headers: {
          "access-control-expose-headers": "content-range",
          "content-range": `0-${Math.max(0, count - 1)}/${count}`,
        },
      });
    }
    const safePath =
      [
        "/",
        "/auth",
        "/leads",
        "/favicon.ico",
        "/@react-refresh",
        "/@tanstack-start/styles.css",
      ].includes(url.pathname) || /^\/(?:src|node_modules|@vite|@id|@fs)\//.test(url.pathname);
    if (
      url.origin === origin &&
      request.method() === "GET" &&
      safePath &&
      !url.pathname.includes("..")
    )
      return route.continue();
    // External font loads are expected blocks; provider/server-function requests fail the check.
    if (!url.hostname.includes("fonts.google"))
      forbidden.push(`Blocked unexpected request ${url.pathname}`);
    return route.abort("blockedbyclient");
  });
  await context.routeWebSocket("**/*", (socket) => socket.close());
  await context.addInitScript(
    ({ user }) => {
      if (location.origin !== "http://127.0.0.1:4173") return;
      const expires = Math.floor(Date.now() / 1000) + 3600;
      const jwt =
        "eyJhbGciOiJIUzI1NiJ9." +
        btoa(
          JSON.stringify({
            sub: user.id,
            exp: expires,
            aud: "authenticated",
            role: "authenticated",
          }),
        ).replace(/=/g, "") +
        ".synthetic";
      localStorage.setItem(
        "sb-127-auth-token",
        JSON.stringify({
          access_token: jwt,
          refresh_token: "synthetic-unused",
          expires_at: expires,
          expires_in: 3600,
          token_type: "bearer",
          user,
        }),
      );
    },
    { user },
  );
  await page.goto(origin + "/leads", { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Leads", exact: true }).waitFor();
  await page.getByText("Harborview Car Rental", { exact: true }).waitFor();
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  check(
    (await page
      .getByRole("navigation", { name: "Workspace navigation" })
      .getByRole("link")
      .count()) === 7,
    "Missing navigation destination",
  );
  check(
    (await page.getByRole("link", { name: "Leads", exact: true }).getAttribute("aria-current")) ===
      "page",
    "Missing active navigation state",
  );
  await page.getByRole("checkbox", { name: /^Never called/ }).check();
  await page.getByText(leads[1].business_name, { exact: true }).waitFor({ state: "hidden" });
  await page.getByRole("checkbox", { name: "Select Harborview Car Rental", exact: true }).check();
  await page.getByRole("button", { name: "Delete selected", exact: true }).waitFor();
  // Only open the confirmation; never confirm deletion or start a session/call/import.
  await page.getByRole("button", { name: "Delete selected", exact: true }).click();
  await page.getByRole("alertdialog").waitFor();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Clear selection", exact: true }).click();
  await page.getByLabel("Search leads", { exact: true }).fill("missing");
  await page.getByText("No leads match these filters", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Clear filters", exact: true }).first().click();
  await page.getByText("Harborview Car Rental", { exact: true }).waitFor();
  for (const width of [1280, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    check(
      !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)),
      `Page overflow at ${width}px`,
    );
    const table = page.getByRole("region", {
      name: "Lead table, scroll horizontally for more columns",
    });
    await table.focus();
    check(
      await table.evaluate((element) => element === document.activeElement),
      "Table scroll region cannot receive keyboard focus",
    );
    if (width < 1000) {
      await table.press("ArrowRight");
      await page.waitForFunction(
        () =>
          document.querySelector('[aria-label="Lead table, scroll horizontally for more columns"]')
            .scrollLeft > 0,
      );
      await table.evaluate((element) => (element.scrollLeft = 0));
    }
    await page.screenshot({ path: `.playwright-cli/leads-${width}.png` });
  }
  await page.keyboard.press("Control+Home");
  await page.getByRole("link", { name: "Skip to workspace" }).focus();
  await page.keyboard.press("Enter");
  check(
    await page.locator("main").evaluate((element) => element === document.activeElement),
    "Skip link did not move focus to workspace",
  );
  state = "error";
  await page.reload();
  await page.getByText("Could not load leads", { exact: true }).waitFor({ timeout: 15000 });
  state = "ready";
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await page.getByText("Harborview Car Rental", { exact: true }).waitFor();
  state = "empty";
  await page.reload();
  await page.getByText("Your lead list starts here", { exact: true }).waitFor();
  check(leadRequests >= 5, "Synthetic lead checks did not execute");
  check(errors.length === 0, "Browser errors: " + errors.join("; "));
  check(forbidden.length === 0, "Guard violations: " + forbidden.join("; "));
  console.log(
    "PASS: synthetic lead workspace, filters, selection, confirmation cancel, keyboard focus, error/retry, empty state, and 1280/768/390px layouts; zero service mutations.",
  );
};
