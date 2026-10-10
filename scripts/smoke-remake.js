async (page) => {
  const origin = "http://127.0.0.1:4174";
  const context = page.context();
  const errors = [];
  const forbidden = [];
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  page.on("pageerror", (error) => errors.push(error.message));
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const asset =
      url.pathname === "/remake/index.html" ||
      url.pathname.startsWith("/src/remake/") ||
      url.pathname.startsWith("/src/lib/") ||
      url.pathname.startsWith("/node_modules/") ||
      url.pathname === "/@fs/workspace/grovoke-dialer/node_modules/vite/dist/client/env.mjs" ||
      url.pathname === "/@vite/client" ||
      url.pathname === "/@react-refresh" ||
      url.pathname.startsWith("/@fs/workspace/callboard-remake/node_modules/.vite/deps/") ||
      url.pathname === "/favicon.ico";
    if (request.method() === "GET" && url.origin === origin && asset) return route.continue();
    forbidden.push(`${request.method()} ${url.origin}${url.pathname}`);
    return route.abort("blockedbyclient");
  });
  await context.routeWebSocket("**/*", (socket) => {
    const url = new URL(socket.url());
    // Vite may try its own local development socket even with hmr:false.
    // Close it too; only this expected local attempt is excluded from violations.
    if (url.origin !== "ws://127.0.0.1:4174" || url.pathname !== "/") {
      forbidden.push("WebSocket " + url.origin + url.pathname);
    }
    socket.close();
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${origin}/remake/index.html`);
  try {
    await page.getByRole("heading", { name: "A clear view of your day." }).waitFor();
  } catch {
    throw new Error(
      "Preview failed to start. Browser errors: " +
        errors.join("; ") +
        "; blocked requests: " +
        forbidden.join("; "),
    );
  }
  check(
    !(await page.locator(".annual-summary").evaluate((element) => element.open)),
    "Annual summary should start collapsed",
  );
  const month = await page.getByLabel("Overview month").inputValue();
  await page.getByLabel("Overview month").selectOption("2025-01");
  check(
    (await page.locator('[data-metric="Dials"]').textContent()) === "0",
    "Empty month kept stale totals",
  );
  await page.getByLabel("Overview month").selectOption(month);
  check(
    (await page.locator(".overview-stats .stat").count()) === 4,
    "Original four-card dashboard was not restored",
  );
  check(
    (await page.locator(".page-overview .chart-day").count()) === 7,
    "Original grouped activity chart was not restored",
  );
  check(
    (await page.locator(".funnel-stage svg path").count()) === 5,
    "Original individual funnel shapes were not restored",
  );
  check(
    await page.locator("main > .topbar").isVisible(),
    "Utility header was not merged into main",
  );
  check(
    (await page.locator(".workspace-body > .topbar").count()) === 0,
    "Separate utility header remains",
  );
  const listLayout = await page.locator(".overview-followups").evaluate((card) => ({
    height: card.getBoundingClientRect().height,
    lists: [...card.querySelectorAll(".followup-list")].map((el) => ({
      scroll: getComputedStyle(el).overflowY,
      height: el.clientHeight,
    })),
  }));
  check(
    listLayout.height <= 381 &&
      listLayout.lists.length === 2 &&
      listLayout.lists.every((list) => list.scroll === "auto" && list.height > 0),
    "Appointments/callbacks must scroll independently in a bounded card: " +
      JSON.stringify(listLayout),
  );
  const scrollStress = await page.locator(".overview-followups").evaluate((card) => {
    const lists = [...card.querySelectorAll(".followup-list")];
    const before = card.getBoundingClientRect().height;
    const clones = lists.map((list) =>
      Array.from({ length: 12 }, () => {
        const row = list.firstElementChild.cloneNode(true);
        list.appendChild(row);
        return row;
      }),
    );
    lists[0].scrollTop = lists[0].scrollHeight;
    const result = {
      height: card.getBoundingClientRect().height,
      before,
      overflowing: lists.every((list) => list.scrollHeight > list.clientHeight),
      topMoved: lists[0].scrollTop > 0,
      bottomStayed: lists[1].scrollTop === 0,
    };
    lists[1].scrollTop = lists[1].scrollHeight;
    result.bottomMoved = lists[1].scrollTop > 0;
    clones.flat().forEach((row) => row.remove());
    lists.forEach((list) => {
      list.scrollTop = 0;
    });
    return result;
  });
  check(
    scrollStress.overflowing &&
      scrollStress.topMoved &&
      scrollStress.bottomStayed &&
      scrollStress.bottomMoved &&
      scrollStress.before === scrollStress.height,
    "Follow-up lists do not scroll independently without growing the card: " +
      JSON.stringify(scrollStress),
  );
  const funnelGap = await page
    .locator(".funnel-stage svg")
    .evaluateAll((shapes) =>
      shapes
        .slice(1)
        .map(
          (shape, i) =>
            shape.getBoundingClientRect().top - shapes[i].getBoundingClientRect().bottom,
        ),
    );
  check(
    funnelGap.every((gap) => gap >= 0 && gap <= 6),
    "Funnel shapes still have large gaps: " + JSON.stringify(funnelGap),
  );
  await page.setViewportSize({ width: 1536, height: 960 });
  await page.screenshot({ path: ".playwright-cli/remake-overview-day.png", fullPage: true });
  await page.getByRole("button", { name: "Switch to night mode" }).click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: ".playwright-cli/remake-overview-night.png", fullPage: true });
  await page.reload();
  check(
    (await page.locator("html").getAttribute("data-theme")) === "night",
    "Theme was not retained on reload",
  );
  await page.getByRole("button", { name: "Switch to day mode" }).click();
  const nav = (name) =>
    page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name, exact: name !== "Leads" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await nav("Settings").click();
  await page.getByRole("switch", { name: "Automatically record calls" }).click();
  await nav("Dialer").click();
  await page.getByRole("button", { name: "Collapse navigation", exact: true }).click();
  check(await nav("Activity").isVisible(), "Collapsed navigation lost destinations");
  await page.getByRole("button", { name: "Expand navigation", exact: true }).click();
  await page.getByRole("button", { name: "Hide lead list", exact: true }).click();
  check((await page.locator(".queue-panel").count()) === 0, "Lead list did not collapse");
  await page.getByRole("button", { name: "Show lead list", exact: true }).click();
  check(
    (await page.getByLabel("Email", { exact: true }).count()) === 0,
    "Contact details should start collapsed",
  );
  await page.getByRole("button", { name: /ASK FOR/ }).click();
  check(
    await page.getByLabel("Email", { exact: true }).isVisible(),
    "Contact expansion lost editable fields",
  );
  await page.getByRole("button", { name: /ASK FOR/ }).click();
  await page.getByRole("button", { name: "Dial · simulated" }).click();
  check(
    await page.getByRole("button", { name: "Save & next", exact: true }).isDisabled(),
    "Can advance during active call",
  );
  await page.getByRole("button", { name: "Add participant", exact: true }).click();
  await page.getByRole("button", { name: "Add to conference" }).click();
  await page.getByRole("button", { name: "Send digit 4", exact: true }).click();
  await page.getByRole("button", { name: "Mute", exact: true }).click();
  check(
    await page.getByRole("button", { name: "Unmute", exact: true }).isVisible(),
    "Mute state did not change",
  );
  const fits = async () =>
    await page.evaluate(() => ({
      page: document.documentElement.scrollHeight <= innerHeight + 1,
      panels: [...document.querySelectorAll(".lead-panel,.outcome-panel")].map((el) => ({
        name: el.className,
        fits: el.scrollHeight <= el.clientHeight + 1,
        bottom: el.getBoundingClientRect().bottom,
      })),
    }));
  let layout = await fits();
  check(
    layout.page && layout.panels.every((panel) => panel.fits && panel.bottom <= 900),
    "Active dialer must fit desktop without scrolling: " + JSON.stringify(layout),
  );
  await page.getByRole("button", { name: /ASK FOR/ }).click();
  layout = await fits();
  check(
    layout.page && layout.panels.every((panel) => panel.fits),
    "Expanded contact details overflow center panel: " + JSON.stringify(layout),
  );
  await page.getByRole("button", { name: /ASK FOR/ }).click();
  await page.setViewportSize({ width: 1280, height: 800 });
  layout = await fits();
  check(
    layout.page && layout.panels.every((panel) => panel.fits),
    "Active dialer overflows a smaller laptop: " + JSON.stringify(layout),
  );
  await page.getByRole("button", { name: /ASK FOR/ }).click();
  layout = await fits();
  check(
    layout.page && layout.panels.every((panel) => panel.fits),
    "Short-screen contact editor pushes call controls out of view: " + JSON.stringify(layout),
  );
  await page.getByRole("button", { name: /ASK FOR/ }).click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(4500);
  await page.screenshot({ path: ".playwright-cli/remake-dialer-day.png", fullPage: true });
  // Change the default while a call is active: the current call must keep its snapshot.
  await nav("Settings").click();
  await page.getByRole("switch", { name: "Automatically record calls" }).click();
  await nav("Dialer").click();
  check(
    await page.getByText("Recording this call (demo)", { exact: true }).isVisible(),
    "Setting changed recording for active call",
  );
  await page.getByRole("button", { name: "Remove Demo teammate · Taylor" }).click();
  check(
    await page.getByRole("button", { name: "End call", exact: true }).isVisible(),
    "Removing a participant ended the original call",
  );
  await page.getByRole("button", { name: "End call", exact: true }).click();
  check(
    (await page.getByRole("dialog").count()) === 0 && (await page.locator(".toast").count()) === 0,
    "Ending a call showed a popup",
  );
  await page.getByRole("button", { name: "Triage held", exact: true }).click();
  await page.getByRole("button", { name: "Appointment booked", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Demo manager");
  await page.getByLabel("Context & conversation notes").fill("Ask for the manager after lunch.");
  await page.getByRole("button", { name: "Reached GK", exact: true }).click();
  await page.getByRole("button", { name: /^Worth a callback/ }).click();
  await page.getByLabel("Reason (optional)").fill("Owner returns after lunch.");
  layout = await fits();
  check(
    layout.page && layout.panels.every((panel) => panel.fits),
    "Callback details overflow right panel: " + JSON.stringify(layout),
  );
  check(
    await page.getByRole("heading", { name: "Harborline Rentals", exact: true }).isVisible(),
    "Editing or outcome selection advanced the lead",
  );
  await page.getByRole("button", { name: "Save", exact: true }).click();
  check(
    (await page.getByRole("dialog").count()) === 0 && (await page.locator(".toast").count()) === 0,
    "Saving showed a popup",
  );
  check(
    await page.getByRole("heading", { name: "Harborline Rentals", exact: true }).isVisible(),
    "Save advanced the lead",
  );
  await page.getByRole("button", { name: "Save & next", exact: true }).click();
  await page.getByRole("heading", { name: "Maple Street Studio", exact: true }).waitFor();
  check(
    await page.getByRole("button", { name: "Dial · simulated" }).isVisible(),
    "Next lead started dialing automatically",
  );
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  check(
    (await page.getByLabel("Name", { exact: true }).inputValue()) === "Demo manager",
    "ASK FOR edit was not saved",
  );
  check(
    (await page.getByLabel("Context & conversation notes").inputValue()) ===
      "Ask for the manager after lunch.",
    "Notes were not saved",
  );
  await page.getByLabel("Role", { exact: true }).fill("Operations lead");
  await page.getByRole("button", { name: "Previous", exact: true }).isDisabled();
  await nav("Activity").click();
  await page.getByRole("dialog", { name: "Keep your changes?" }).waitFor();
  await page.getByRole("button", { name: "Keep editing" }).click();
  check(
    (await page.getByLabel("Role", { exact: true }).inputValue()) === "Operations lead",
    "Cancel navigation discarded draft",
  );
  await nav("Activity").click();
  await page.getByRole("button", { name: "Save & continue" }).click();
  await page.getByRole("heading", { name: "Every conversation, remembered." }).waitFor();
  check(
    (await page.locator('[data-metric="Triage held"]').textContent()) === "2",
    "Triage button did not update daily metric",
  );
  check(
    (await page.locator('[data-metric="Appointments booked"]').textContent()) === "1",
    "Booked button did not update daily metric",
  );
  check(
    (await page.locator('[data-metric="Connected"]').textContent()) === "2",
    "Milestones double-counted Connected",
  );
  const day = await page.getByLabel("Activity date").inputValue();
  await page.getByLabel("Activity date").fill("2025-01-01");
  check(
    (await page.locator('[data-metric="Dials"]').textContent()) === "0",
    "Empty date kept stale daily metrics",
  );
  check(
    (await page.getByRole("button", { name: "View", exact: true }).count()) === 0,
    "Date filter kept other-day calls",
  );
  await page.getByLabel("Activity date").fill(day);
  await nav("Leads").click();
  await page.getByLabel("Never called", { exact: true }).check();
  check(
    (await page.getByRole("button", { name: "Harborline Rentals", exact: true }).count()) === 0,
    "Never-called filter includes a saved outcome",
  );
  await page.getByLabel("Never called", { exact: true }).uncheck();
  const leadRow = page
    .getByRole("row")
    .filter({ has: page.getByRole("button", { name: "Harborline Rentals", exact: true }) });
  check(
    (await leadRow.getByRole("cell", { name: "1", exact: true }).count()) === 1,
    "Dial count did not increment",
  );
  await page.getByRole("button", { name: /Callbacks/ }).click();
  check(
    await page.getByRole("button", { name: "Harborline Rentals", exact: true }).isVisible(),
    "Callback list missing flagged lead",
  );
  await nav("Bookings").click();
  await page.getByRole("button", { name: "New booking" }).click();
  await page
    .getByLabel("Day", { exact: true })
    .fill(new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10));
  const slots = page.getByRole("dialog").getByRole("button", { name: /^\d{1,2} [AP]M$/ });
  check((await slots.count()) === 24, "Booking slots do not include every hour");
  check(
    (await page.getByLabel("Invite title").inputValue()) === "Ash x Harborline Rentals",
    "Booking title does not use the lead name",
  );
  await page.getByRole("button", { name: "Save demo booking" }).click();
  await page
    .getByRole("button", { name: "Delete booking record Ash x Harborline Rentals" })
    .waitFor();
  await page
    .getByRole("button", { name: "Delete booking record Ash x Harborline Rentals" })
    .click();
  await page.getByRole("button", { name: "Delete record only", exact: true }).click();
  check(
    (await page
      .getByRole("button", { name: "Delete booking record Ash x Harborline Rentals" })
      .count()) === 0,
    "Booking record was not removed",
  );
  await nav("Sessions").click();
  await page.getByRole("button", { name: "New session" }).click();
  await page.getByLabel("Session name").fill("Demo callbacks");
  await page.getByLabel("Include leads").selectOption("callbacks");
  await page.getByRole("button", { name: "Create session" }).click();
  await page.getByRole("heading", { name: "Demo callbacks", exact: true }).waitFor();
  const sessionCard = page
    .locator(".session-card")
    .filter({ has: page.getByRole("heading", { name: "Demo callbacks", exact: true }) });
  await sessionCard.getByRole("button", { name: "Start session", exact: true }).click();
  await page.getByLabel("Session elapsed time").waitFor();
  check(
    (await page.getByRole("button", { name: "End call", exact: true }).count()) === 0,
    "Session start dialed automatically",
  );
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Pause session", exact: true }).click();
  const frozen = await page.getByLabel("Session elapsed time").textContent();
  await page.waitForTimeout(1200);
  check(
    (await page.getByLabel("Session elapsed time").textContent()) === frozen,
    "Paused timer kept running",
  );
  check(
    await page.getByRole("button", { name: "Dial · simulated", exact: true }).isDisabled(),
    "Paused session allowed dialing",
  );
  await page.getByRole("button", { name: "Resume session", exact: true }).click();
  await page.getByRole("button", { name: "Dial · simulated", exact: true }).click();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Stop session", exact: true }).click();
  check(
    (await page.getByRole("button", { name: "End call", exact: true }).count()) === 0,
    "Stop session left its call active",
  );
  await page.getByRole("button", { name: "Reached DM", exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await nav("Sessions").click();
  check(
    (await sessionCard.locator(".session-totals").textContent()).includes("Calls1"),
    "Session call total missed its call",
  );
  for (const width of [1280, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const navigate = async (name) => {
      const menu = page.getByRole("button", { name: "Open navigation" });
      if (await menu.isVisible()) await menu.click();
      await nav(name).click();
    };
    for (const name of [
      "Overview",
      "Leads",
      "Dialer",
      "Sessions",
      "Activity",
      "Bookings",
      "Time Zones",
      "Settings",
    ]) {
      await navigate(name);
      check(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        `${name} overflows at ${width}px: ` +
          JSON.stringify(
            await page.evaluate(() =>
              [...document.querySelectorAll("body *")]
                .filter((el) => el.getBoundingClientRect().right > innerWidth + 1)
                .slice(0, 12)
                .map((el) => ({
                  tag: el.tagName,
                  cls: el.className,
                  right: el.getBoundingClientRect().right,
                })),
            ),
          ),
      );
    }
    await navigate("Dialer");
    if (width >= 768) {
      const layout = await fits();
      check(
        layout.page && layout.panels.every((panel) => panel.fits),
        `Dialer scrolls at ${width}px: ` + JSON.stringify(layout),
      );
    }
    await page.getByRole("button", { name: "Switch to night mode" }).click();
    await page.waitForTimeout(200);
    await page.screenshot({
      path: `.playwright-cli/remake-dialer-night-${width}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "Switch to day mode" }).click();
  }
  await page.getByRole("link", { name: "Skip to content", exact: true }).focus();
  await page.keyboard.press("Enter");
  check(
    await page.locator("main").evaluate((element) => element === document.activeElement),
    "Skip link did not focus main",
  );
  check(errors.length === 0, "Browser errors: " + errors.join("; "));
  check(forbidden.length === 0, "Forbidden network: " + forbidden.join("; "));
  return "PASS: isolated remake — 8 screens at 1280/768/390px, theme persistence, ASK FOR, explicit saving, Previous, draft guard, callback filter, call count, recording snapshot, simulated conferencing/mute/keypad, 24 booking slots, record-only deletion, daily/monthly filters, milestone metrics, collapsible navigation/queue/contact details, desktop panel containment and session Start/Pause/Resume/Stop timers; zero provider requests.";
};
