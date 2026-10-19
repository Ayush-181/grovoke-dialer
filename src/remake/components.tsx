import * as Dialog from "@radix-ui/react-dialog";
import { X, ArrowUpRight, ArrowDownRight, type LucideIcon } from "lucide-react";
import type { ReactNode, InputHTMLAttributes } from "react";

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}>{children}</section>;
}
export function PanelHead({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="panel-head">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
export function Field({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        autoComplete="off"
        name={props.name ?? label.toLowerCase().replaceAll(" ", "-")}
        {...props}
      />
    </label>
  );
}
export function Modal({
  title,
  description,
  children,
  open,
  onClose,
}: {
  title: string;
  description: string;
  children: ReactNode;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content className="modal">
          <Dialog.Title>{title}</Dialog.Title>
          <Dialog.Description>{description}</Dialog.Description>
          <Dialog.Close className="icon-button modal-close" aria-label="Close dialog">
            <X aria-hidden="true" size={18} />
          </Dialog.Close>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Stat({
  icon: Icon,
  label,
  value,
  change,
  comparison = "vs. previous week",
  tone = "jade",
  detail,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  change: string;
  comparison?: string;
  tone?: string;
  detail?: { label: string; value: string };
}) {
  const directional = change !== "—" && change !== "0%";
  return (
    <Panel className="stat">
      <div className="stat-heading">
        <p>{label}</p>
        <span className={`stat-icon ${tone}`}>
          <Icon aria-hidden="true" size={18} />
        </span>
      </div>
      <strong data-metric={label}>{value}</strong>
      {detail && (
        <dl className="stat-support">
          <dt>{detail.label}</dt>
          <dd>{detail.value}</dd>
        </dl>
      )}
      <small className="stat-comparison">
        {directional &&
          (change.startsWith("-") ? (
            <ArrowDownRight aria-hidden="true" size={14} />
          ) : (
            <ArrowUpRight aria-hidden="true" size={14} />
          ))}
        {change !== "—" && <b>{change === "0%" ? "No change" : change}</b>}
        <span>{comparison}</span>
      </small>
    </Panel>
  );
}
export function Empty({ title, description }: { title: string; description: string }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}
