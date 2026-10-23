import type { Lead } from "./model";
import type { Contact, CustomField, CustomValue } from "./domain";
import { Plus, Trash2, UserCheck, Users } from "lucide-react";
import { Field } from "./components";
import "./records-workflows.css";

export function ContactsPanel({
  lead,
  onChange,
}: {
  lead: Lead;
  onChange: (patch: Partial<Lead>) => void;
}) {
  const contacts: Contact[] = lead.contacts
    ? lead.contacts
    : lead.contact
      ? [
          {
            id: `contact-${lead.id}`,
            name: lead.contact,
            role: lead.role,
            phone: lead.direct,
            email: lead.email,
          },
        ]
      : [];
  const update = (id: string, patch: Partial<Contact>) => {
    const before = contacts.find((contact) => contact.id === id)!;
    const next = { ...before, ...patch };
    const primary = lead.contact === before.name && (lead.direct === before.phone || !lead.direct);
    onChange({
      contacts: contacts.map((contact) => (contact.id === id ? next : contact)),
      ...(primary
        ? { contact: next.name, role: next.role, direct: next.phone, email: next.email }
        : {}),
    });
  };
  return (
    <div className="contacts-editor">
      <div className="records-section-heading">
        <strong>
          <Users aria-hidden="true" size={16} />
          Business contacts
        </strong>
        <button
          type="button"
          className="text-button"
          onClick={() =>
            onChange({
              contacts: [
                ...contacts,
                { id: crypto.randomUUID(), name: "", role: "", phone: "", email: "" },
              ],
            })
          }
        >
          <Plus aria-hidden="true" size={15} />
          Add contact
        </button>
      </div>
      {!contacts.length && (
        <p className="hint">Add the people who answer and the people who make decisions.</p>
      )}
      {contacts.map((contact, index) => (
        <fieldset className="contact-record" key={contact.id}>
          <legend>Contact {index + 1}</legend>
          <div className="field-grid">
            <Field
              label={`Contact ${index + 1} name`}
              value={contact.name}
              onChange={(e) => update(contact.id, { name: e.target.value })}
            />
            <Field
              label={`Contact ${index + 1} role`}
              value={contact.role}
              placeholder="Owner, front desk…"
              onChange={(e) => update(contact.id, { role: e.target.value })}
            />
            <Field
              label={`Contact ${index + 1} phone`}
              type="tel"
              value={contact.phone}
              placeholder="+country code"
              onChange={(e) => update(contact.id, { phone: e.target.value })}
            />
            <Field
              label={`Contact ${index + 1} email`}
              type="email"
              value={contact.email}
              onChange={(e) => update(contact.id, { email: e.target.value })}
            />
          </div>
          <div className="contact-record-actions">
            <button
              type="button"
              className="text-button"
              disabled={!contact.name.trim()}
              onClick={() =>
                onChange({
                  contacts,
                  contact: contact.name,
                  role: contact.role,
                  direct: contact.phone,
                  email: contact.email,
                })
              }
            >
              <UserCheck aria-hidden="true" size={15} />
              {lead.contact === contact.name && lead.direct === contact.phone
                ? "Current ASK FOR"
                : "Use as ASK FOR"}
            </button>
            <button
              type="button"
              className="text-button"
              aria-label={`Remove contact ${index + 1}`}
              onClick={() => {
                const next = contacts.filter((item) => item.id !== contact.id);
                const primary = lead.contact === contact.name && lead.direct === contact.phone;
                onChange({
                  contacts: next,
                  ...(primary
                    ? {
                        contact: next[0]?.name ?? "",
                        role: next[0]?.role ?? "",
                        direct: next[0]?.phone ?? "",
                        email: next[0]?.email ?? "",
                      }
                    : {}),
                });
              }}
            >
              <Trash2 aria-hidden="true" size={14} />
              Remove
            </button>
          </div>
        </fieldset>
      ))}
    </div>
  );
}

export function CustomFieldsEditor({
  fields,
  values = {},
  onChange,
}: {
  fields: CustomField[];
  values?: Record<string, CustomValue>;
  onChange: (values: Record<string, CustomValue>) => void;
}) {
  if (!fields.length) return null;
  return (
    <fieldset className="custom-fields-editor">
      <legend>Business research & custom fields</legend>
      <div className="field-grid">
        {fields.map((field) => {
          const value = values[field.id];
          const write = (next: CustomValue) => onChange({ ...values, [field.id]: next });
          if (field.type === "checkbox")
            return (
              <label className="checkbox-label" key={field.id}>
                <input
                  type="checkbox"
                  checked={value === true}
                  onChange={(event) => write(event.target.checked)}
                />
                {field.label}
              </label>
            );
          if (field.type === "select")
            return (
              <label className="field" key={field.id}>
                <span>{field.label}</span>
                <select
                  value={typeof value === "string" ? value : ""}
                  onChange={(event) => write(event.target.value)}
                >
                  <option value="">Not set</option>
                  {field.options.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </label>
            );
          return (
            <Field
              key={field.id}
              label={field.label}
              type={
                field.type === "number"
                  ? "number"
                  : field.type === "date"
                    ? "date"
                    : field.type === "url"
                      ? "url"
                      : "text"
              }
              value={typeof value === "boolean" || value == null ? "" : value}
              onChange={(event) =>
                write(
                  field.type === "number"
                    ? event.target.value === ""
                      ? null
                      : Number(event.target.value)
                    : event.target.value,
                )
              }
            />
          );
        })}
      </div>
    </fieldset>
  );
}
