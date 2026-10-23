import type { Lead } from "./model";
import type { CustomField } from "./domain";

type Identity = {
  displayName: string;
  workspaceName: string;
  email: string;
  phone?: string;
  senderPhone?: string;
};

export const SCRIPT_TOKENS = [
  "Company",
  "FirstName",
  "ContactName",
  "ContactRole",
  "Phone",
  "Email",
  "City",
  "MyName",
  "MyCompany",
  "MyEmail",
  "MyPhone",
] as const;

/** Plain-text substitution only: values are never interpreted as HTML or code. */
export function renderScript(
  body: string,
  lead: Lead | undefined,
  identity: Identity,
  customFields: CustomField[] = [],
): { text: string; missing: string[] } {
  const values: Record<string, string | undefined> = {
    company: lead?.business,
    business: lead?.business,
    firstname: lead?.contact.trim().split(/\s+/)[0],
    contactname: lead?.contact,
    contact: lead?.contact,
    contactrole: lead?.role,
    role: lead?.role,
    phone: lead?.phone,
    email: lead?.email,
    city: lead?.city,
    myname: identity.displayName,
    myfirstname: identity.displayName.trim().split(/\s+/)[0],
    mycompany: identity.workspaceName,
    workspacename: identity.workspaceName,
    myemail: identity.email,
    myphone: identity.senderPhone || identity.phone,
  };
  const missing = new Set<string>();
  const text = body.replace(/\{([^{}]+)\}/g, (placeholder, name: string) => {
    const key = name.trim().replace(/\s+/g, "").toLocaleLowerCase();
    let value = values[key];
    if (value === undefined && lead) {
      const field = customFields.find(
        (item) =>
          `custom:${item.label}`.replace(/\s+/g, "").toLocaleLowerCase() === key ||
          `field:${item.id}`.toLocaleLowerCase() === key,
      );
      if (field) {
        const raw = lead.customValues?.[field.id];
        value =
          raw === null || raw === undefined
            ? undefined
            : typeof raw === "boolean"
              ? raw
                ? "Yes"
                : "No"
              : String(raw);
      }
    }
    if (value === undefined || !value.trim()) {
      missing.add(name.trim());
      return placeholder;
    }
    return value;
  });
  return { text, missing: [...missing] };
}

/** Keep saved script references intact when a custom field is renamed. */
export function renameCustomFieldTokens(body: string, before: string, after: string): string {
  const prior = `custom:${before}`.replace(/\s+/g, "").toLocaleLowerCase();
  return body.replace(/\{([^{}]+)\}/g, (placeholder, name: string) =>
    name.trim().replace(/\s+/g, "").toLocaleLowerCase() === prior
      ? `{Custom:${after}}`
      : placeholder,
  );
}
