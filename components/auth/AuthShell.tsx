"use client";

import { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  title: string;
  subtitle?: string;
  children: ReactNode;
};

export function AuthShell({ title, subtitle, children }: Props) {
  return (
    <div className="relative flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute left-1/2 top-[-10%] h-[40rem] w-[40rem] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,theme(colors.cyan.500/.25),transparent_60%)] blur-3xl" />
        <div className="absolute right-[-10%] bottom-[-10%] h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(ellipse_at_center,theme(colors.purple.500/.2),transparent_60%)] blur-3xl" />
      </div>

      <div className="w-full max-w-sm">
        <Card className="backdrop-blur supports-[backdrop-filter]:bg-background/70 border-border/60">
          <CardHeader>
            <CardTitle className="text-2xl tracking-tight">
              {title}
            </CardTitle>
            {subtitle ? (
              <p className="text-sm text-muted-foreground leading-relaxed">{subtitle}</p>
            ) : null}
          </CardHeader>
          <CardContent>
            {children}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


