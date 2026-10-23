import { describe, expect, test } from "bun:test";
import { initialState } from "../src/remake/model";
import { renderScript, renameCustomFieldTokens } from "../src/remake/template-values";
import type { CustomField } from "../src/remake/domain";

const identity = {
  displayName: "Ash Example",
  workspaceName: "Example Calling",
  email: "ash@example.invalid",
};

describe("plain-text call-script rendering", () => {
  test("uses the business/contact/identity belonging to the selected context", () => {
    const state = initialState();
    const lead = {
      ...state.draft,
      business: "Example business",
      contact: "Taylor Example",
      role: "Owner",
    };
    expect(
      renderScript(
        "Hi {FirstName}, {MyName} from {MyCompany} about {Company}; ask for the {ContactRole}.",
        lead,
        identity,
      ),
    ).toEqual({
      text: "Hi Taylor, Ash Example from Example Calling about Example business; ask for the Owner.",
      missing: [],
    });
  });
  test("leaves unresolved values visible and reports each word only once", () => {
    const lead = { ...initialState().draft, email: "" };
    expect(renderScript("{Email} {MyPhone} {Email} {Unknown}", lead, identity)).toEqual({
      text: "{Email} {MyPhone} {Email} {Unknown}",
      missing: ["Email", "MyPhone", "Unknown"],
    });
  });
  test("preserves zero and false custom-field values rather than treating them as missing", () => {
    const fields: CustomField[] = [
      { id: "budget", label: "Budget", type: "number", options: [], showInTable: false },
      { id: "active", label: "Active customer", type: "checkbox", options: [], showInTable: false },
    ];
    const lead = { ...initialState().draft, customValues: { budget: 0, active: false } };
    expect(renderScript("{Custom:Budget}: {field:active}", lead, identity, fields)).toEqual({
      text: "0: No",
      missing: [],
    });
  });
  test("returns substituted content literally, without recursively expanding values", () => {
    const lead = { ...initialState().draft, business: "<script>not executable</script> {MyName}" };
    expect(renderScript("{Company}", lead, identity).text).toBe(
      "<script>not executable</script> {MyName}",
    );
  });
  test("renaming a custom field updates its named script token without touching other words", () => {
    expect(
      renameCustomFieldTokens(
        "{Custom:Old Budget} {field:stable-id} Old Budget {Company}",
        "Old Budget",
        "Annual Budget",
      ),
    ).toBe("{Custom:Annual Budget} {field:stable-id} Old Budget {Company}");
  });
});
