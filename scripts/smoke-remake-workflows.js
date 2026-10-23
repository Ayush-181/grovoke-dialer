async (page) => {
  page.setDefaultTimeout(10000);
  const origin = "http://127.0.0.1:4175";
  const errors = [],
    blocked = [];
  const check = (value, message) => {
    if (!value) throw new Error(message);
  };
  page.on("pageerror", (error) => errors.push(error.message));
  await page.context().route("**/*", (route) => {
    const req = route.request(),
      url = new URL(req.url());
    if (
      req.method() === "GET" &&
      url.origin === origin &&
      ["/remake/index.html", "/favicon.ico"].includes(url.pathname)
    )
      return route.continue();
    blocked.push(req.method() + " " + url.origin + url.pathname);
    return route.abort("blockedbyclient");
  });
  await page.context().routeWebSocket("**/*", (socket) => {
    blocked.push("WebSocket");
    socket.close();
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(origin + "/remake/index.html");
  const nav = (name) =>
    page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name, exact: true });
  const fit = async () =>
    check(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      "Page overflows viewport",
    );
  // Only this isolated synthetic browser profile is reset.
  await page.evaluate(() => localStorage.removeItem("callboard-workspace-v1"));
  await page.reload();
  check(await nav("Configuration").isVisible(), "Configuration navigation missing");
  await nav("Configuration").click();
  await page.getByRole("button", { name: "New script", exact: true }).click();
  await page.getByLabel("Script name", { exact: true }).fill("Synthetic follow-through");
  await page
    .getByLabel("Script body", { exact: true })
    .fill("Hi {Contact}, calling about {Business}.");
  await page.getByRole("button", { name: "Save script", exact: true }).click();
  await page
    .getByRole("button", { name: "Synthetic follow-through Opener", exact: true })
    .waitFor();
  check(
    !(await page.getByLabel("Script preview", { exact: true }).textContent()).includes(
      "{Business}",
    ),
    "Script fields were not rendered",
  );
  await page.getByRole("button", { name: "Pipeline", exact: true }).click();
  await page.getByRole("button", { name: "New stage", exact: true }).click();
  await page.getByLabel("Stage name", { exact: true }).fill("Review proposal");
  await page.getByRole("button", { name: "Save stage", exact: true }).click();
  await page.getByRole("heading", { name: "Review proposal", exact: true }).waitFor();
  await page.getByRole("button", { name: "Custom fields", exact: true }).click();
  await page.getByRole("button", { name: "Add field", exact: true }).click();
  await page.getByLabel("Field label", { exact: true }).fill("Buying trigger");
  await page.getByRole("button", { name: "Save field", exact: true }).click();
  await page.getByRole("heading", { name: "Buying trigger", exact: true }).waitFor();
  await nav("Follow-ups").click();
  await page.getByRole("button", { name: "Schedule callback", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Callback reason", { exact: true })
    .fill("Synthetic decision-maker follow-up");
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10) + "T15:00";
  await dialog.getByLabel("Callback date and time", { exact: true }).fill(tomorrow);
  await dialog.getByRole("button", { name: "Save callback", exact: true }).click();
  await page.getByText("Synthetic decision-maker follow-up", { exact: true }).waitFor();
  await nav("Data").click();
  await page
    .getByLabel("Or paste CSV with a header row", { exact: true })
    .fill("Business,Phone,Email\nSynthetic New Business,+12125550199,new@example.invalid");
  await page.getByRole("button", { name: "Use pasted rows", exact: true }).click();
  await page.getByRole("button", { name: "Review import", exact: true }).click();
  check(
    await page.getByText("Synthetic New Business", { exact: true }).isVisible(),
    "Import review missing",
  );
  await page.getByRole("button", { name: /Confirm import/ }).click();
  await page.getByText("Import batch recorded.", { exact: false }).waitFor();
  await page.waitForTimeout(350);
  await page.reload();
  await nav("Leads").click();
  await page.getByLabel("Search leads", { exact: true }).fill("Synthetic New Business");
  check(
    await page.getByRole("button", { name: "Synthetic New Business", exact: true }).isVisible(),
    "Imported record did not survive reload",
  );
  await nav("Configuration").click();
  check(
    await page
      .getByRole("button", { name: "Synthetic follow-through Opener", exact: true })
      .isVisible(),
    "Script did not survive reload",
  );
  await nav("Follow-ups").click();
  check(
    await page.getByText("Synthetic decision-maker follow-up", { exact: true }).isVisible(),
    "Follow-up did not survive reload",
  );
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const menu = page.getByRole("button", { name: "Open navigation", exact: true });
    if (await menu.isVisible()) await menu.click();
    await nav("Configuration").click();
    await fit();
    await page.screenshot({
      path: `.playwright-cli/remake-configuration-${width}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await nav("Dialer").click();
  await page.getByRole("button", { name: "Switch to night mode", exact: true }).click();
  await page.waitForTimeout(200);
  const colors = await page
    .locator(".call-card .keypad button")
    .first()
    .evaluate((el) => ({
      background: getComputedStyle(el).backgroundColor,
      color: getComputedStyle(el).color,
      card: getComputedStyle(el).getPropertyValue("--card"),
    }));
  check(
    colors.background !== "rgb(255, 255, 255)",
    "Night keypad stayed white: " + JSON.stringify(colors),
  );
  await page.screenshot({ path: ".playwright-cli/complete-dialer-night.png", fullPage: true });
  check(errors.length === 0, "Browser errors: " + errors.join("; "));
  check(blocked.length === 0, "Provider requests: " + blocked.join("; "));
  return (
    "PASS: isolated remake workflows — scripts, stage and field editors, scheduled callbacks, reviewed CSV import and reload persistence; 1440/768/390px; zero provider requests. Night keypad: " +
    JSON.stringify(colors)
  );
};
