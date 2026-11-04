import { useState } from "react";
import { Command } from "cmdk";
import { Search, Phone } from "lucide-react";
import { Modal } from "./components";
import type { Lead } from "./model";
import type { Page } from "./App";
import { dialNumber } from "./numbers";

export function CommandPalette({
  open,
  onClose,
  leads,
  pages,
  navigate,
  openLead,
  dial,
}: {
  open: boolean;
  onClose: () => void;
  leads: Lead[];
  pages: readonly { id: Page; label: string }[];
  navigate: (page: Page) => void;
  openLead: (id: string) => void;
  dial: (phone: string) => void;
}) {
  const [query, setQuery] = useState("");
  const phone = dialNumber(query);
  function run(action: () => void) {
    onClose();
    setQuery("");
    action();
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Search Call Board"
      description="Find a lead, open a page, or prepare a number to call."
    >
      <Command
        className="mx-command"
        loop
        filter={(value, search) =>
          value.toLowerCase().includes(search.toLowerCase()) ||
          (search.replace(/\D/g, "").length >= 3 &&
            value.replace(/\D/g, "").includes(search.replace(/\D/g, "")))
            ? 1
            : 0
        }
      >
        <div className="mx-command-input">
          <Search size={20} />
          <Command.Input
            aria-label="Search leads, pages and numbers"
            value={query}
            onValueChange={setQuery}
            placeholder="Search leads, pages, or a phone number…"
          />
        </div>
        <Command.List>
          <Command.Empty>No results found.</Command.Empty>
          {phone && (
            <Command.Group heading="Dial">
              <Command.Item value={query} onSelect={() => run(() => dial(phone))}>
                <Phone size={16} />
                Prepare {phone}
                <small>Open dialpad</small>
              </Command.Item>
            </Command.Group>
          )}
          <Command.Group heading="Leads">
            {leads.map((lead) => (
              <Command.Item
                key={lead.id}
                value={`${lead.business} ${lead.contact} ${lead.phone} ${lead.direct} ${lead.id}`}
                onSelect={() => run(() => openLead(lead.id))}
              >
                {lead.business}
                <small>{lead.phone}</small>
              </Command.Item>
            ))}
          </Command.Group>
          <Command.Group heading="Pages">
            {pages.map((page) => (
              <Command.Item key={page.id} onSelect={() => run(() => navigate(page.id))}>
                {page.label}
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
        <p className="hint">↑ ↓ to move · Enter to open · Esc to close</p>
      </Command>
    </Modal>
  );
}
