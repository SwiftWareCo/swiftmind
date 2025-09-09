"use client";

import { PropsWithChildren } from "react";
import { 
  HydrationBoundary,
  DehydratedState
} from "@tanstack/react-query";

interface HydrationProviderProps extends PropsWithChildren {
  dehydratedState?: DehydratedState;
}

export function HydrationProvider({ children, dehydratedState }: HydrationProviderProps) {
  if (!dehydratedState) {
    return <>{children}</>;
  }

  return (
    <HydrationBoundary state={dehydratedState}>
      {children}
    </HydrationBoundary>
  );
}
