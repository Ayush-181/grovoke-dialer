import type { ReactNode } from "react";
import { RuntimeContext, demoRuntime, type RuntimeServices } from "./runtime";
export function RuntimeProvider({
  runtime,
  children,
}: {
  runtime?: RuntimeServices;
  children: ReactNode;
}) {
  return (
    <RuntimeContext.Provider value={runtime ?? demoRuntime}>{children}</RuntimeContext.Provider>
  );
}
