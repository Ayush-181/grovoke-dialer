import { expect, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { applyLeadFilters } from "../src/lib/sessions";

test("never-called filters missing outcomes without relying on the call counter", async () => {
  let requestUrl = "";
  const client = createClient("https://example.invalid", "test-key", {
    auth: { persistSession: false },
    global: {
      fetch: async (input) => {
        requestUrl = String(input);
        return new Response("[]", { headers: { "Content-Type": "application/json" } });
      },
    },
  });
  await applyLeadFilters(client.from("leads").select("*"), {
    neverCalled: true,
    outcome: "no_answer",
    search: "Harbor",
    state: "NY",
  });
  const params = new URL(requestUrl).searchParams;
  expect(params.get("outcome")).toBe("is.null");
  expect(params.has("call_count")).toBe(false);
  expect(params.get("or")).toContain("business_name.ilike.%Harbor%");
  expect(params.get("state")).toBe("ilike.NY");

  await applyLeadFilters(client.from("leads").select("*"), {
    neverCalled: false,
    outcome: "no_answer",
  });
  expect(new URL(requestUrl).searchParams.get("outcome")).toBe("eq.no_answer");

  await applyLeadFilters(client.from("leads").select("*"), { neverCalled: false });
  expect(new URL(requestUrl).searchParams.has("outcome")).toBe(false);
});
