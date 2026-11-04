async (page) => {
  const origin = "http://127.0.0.1:4174",
    errors = [],
    blocked = [];
  const context = page.context();
  page.on("pageerror", (e) => errors.push(e.message));
  await context.route("**/*", (route) => {
    const r = route.request(),
      u = new URL(r.url());
    const asset =
      u.pathname === "/remake/index.html" ||
      u.pathname.startsWith("/src/remake/") ||
      u.pathname.startsWith("/src/lib/") ||
      u.pathname.startsWith("/node_modules/") ||
      ["/@vite/client", "/@react-refresh", "/favicon.ico"].includes(u.pathname) ||
      (u.pathname.startsWith("/@fs/") &&
        /\/node_modules\/(vite\/dist\/client\/env\.mjs|\.vite\/deps\/[^/]+)$/.test(u.pathname));
    if (r.method() === "GET" && u.origin === origin && asset) return route.continue();
    blocked.push(r.method() + " " + u.pathname);
    return route.abort();
  });
  await context.routeWebSocket("**/*", (s) => s.close());
  await page.goto(origin + "/remake/index.html");
  await page.getByRole("heading", { name: "Overview", exact: true }).waitFor();
  const routes = [
    "overview",
    "leads",
    "dialer",
    "sessions",
    "activity",
    "bookings",
    "timezones",
    "followups",
    "configuration",
    "data",
    "settings",
  ];
  for (const theme of ["night", "day"]) {
    await page.evaluate((t) => {
      document.documentElement.dataset.theme = t;
    }, theme);
    for (const width of [390, 768, 1280, 1600]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const route of routes) {
        await page.evaluate((r) => {
          location.hash = r;
        }, route);
        await page.locator(".page-" + route).waitFor();
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        );
        if (overflow) throw Error("Page overflow: " + route + " " + theme + " " + width);
      }
    }
  }
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.evaluate(() => {
    location.hash = "overview";
    document.documentElement.dataset.theme = "night";
  });
  await page.getByRole("button", { name: "14D", exact: true }).click();
  if ((await page.locator(".mx-stack-day").count()) !== 14)
    throw Error("14-day chart did not update");
  await page.getByRole("button", { name: "Connected with owner", exact: false }).click();
  await page.screenshot({ path: ".playwright-cli/mac-overview-night.png" });
  await page.getByRole("button", { name: "Search leads and pages" }).click();
  await page
    .getByRole("combobox", { name: "Search leads, pages and numbers" })
    .fill("+15125550148");
  await page.getByRole("option", { name: /Prepare/ }).click();
  await page.locator(".mx-floating").waitFor();
  if (await page.locator(".active-call-bar").count()) throw Error("Palette placed a call");
  await page.getByRole("button", { name: "Close dialpad", exact: true }).click();
  await page.evaluate(() => {
    location.hash = "dialer";
  });
  await page.locator(".page-dialer").waitFor();
  await page.screenshot({ path: ".playwright-cli/mac-dialer-night.png" });
  // This preview contains only the demo runtime; the request guard blocks providers and writes.
  await page.getByRole("button", { name: "Dial · simulated", exact: true }).click();
  await page.getByRole("button", { name: "Send digit 4", exact: true }).click();
  if (!(await page.getByLabel("Sent keypad digits").textContent()).includes("4"))
    throw Error("Simulated keypad did not send a digit");
  await page.locator(".mx-callback").click();
  await page.getByRole("button", { name: "Add participant", exact: true }).click();
  await page.getByLabel("Participant phone number").fill("+15125550148");
  await page
    .getByRole("region", { name: "Add a participant" })
    .getByRole("button", { name: "Dial", exact: true })
    .click();
  await page.getByRole("button", { name: "End conference", exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.evaluate(() => {
    location.hash = "followups";
  });
  await page.getByRole("heading", { name: "Worth a callback · pick a time" }).waitFor();
  await page.getByRole("button", { name: "Worth a callback", exact: true }).click();
  if (!(await page.locator(".follow-up-row").count()))
    throw Error("Callback flag was not visible in Follow-ups");
  await page.evaluate(() => {
    location.hash = "timezones";
  });
  await page.locator(".mx-zone-button").nth(2).click();
  if ((await page.locator('.mx-zone-button[aria-pressed="true"]').count()) !== 1)
    throw Error("Anchor selection failed");
  if (errors.length || blocked.length) throw Error(JSON.stringify({ errors, blocked }));
  return "PASS: isolated remake Mac redesign; 88 route/theme/viewport checks, chart, search, dialpad, timezone anchor";
};
