"use client";

import React, { createContext, useContext } from "react";

export type TenantContextValue = {
  tenantId: string;
  slug: string;
};

const TenantContext = createContext<TenantContextValue | null>(null);

type TenantProviderProps = React.PropsWithChildren<{
  value: TenantContextValue;
}>;

export function TenantProvider({ value, children }: TenantProviderProps) {
  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant(): TenantContextValue {
  const ctx = useContext(TenantContext);
  if (!ctx) {
    throw new Error("useTenant must be used within a TenantProvider");
  }
  return ctx;
}


