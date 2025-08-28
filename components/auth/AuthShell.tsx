"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AuroraBackground } from "./AuroraBackground";
import { HelpCircle, Globe } from "lucide-react";

interface TenantInfo {
  name: string;
  role?: string;
}

interface Props {
  title: string;
  subtitle?: string;
  children: ReactNode;
  tenantInfo?: TenantInfo; // For invite accept pages
  showSupportLink?: boolean;
  className?: string;
}

export function AuthShell({ 
  children, 
  tenantInfo,
  showSupportLink = true,
  className = ""
}: Props) {
  return (
    <div className={`relative flex min-h-svh w-full items-center justify-center p-4 md:p-6 ${className}`}>
      {/* Aurora Background */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <AuroraBackground />
      </div>

      {/* Background overlay for better contrast */}
      <div className="pointer-events-none absolute inset-0 -z-5 bg-background/20 dark:bg-background/40" />

      {/* Navigation Header */}
      {showSupportLink && (
        <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="text-foreground/70 hover:text-foreground">
            <Link href="mailto:support@swiftmind.app">
              <HelpCircle className="mr-2" />
              Support
            </Link>
          </Button>
          
          {/* Locale switcher placeholder */}
          <Button variant="ghost" size="sm" className="text-foreground/70 hover:text-foreground opacity-50" disabled>
            <Globe />
          </Button>
        </div>
      )}

      {/* Main Content */}
      <div className="w-full max-w-md relative z-0">
        {/* Brand Section */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            {/* Logo placeholder - replace with actual logo */}
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-xl">S</span>
            </div>
          </div>
          
          <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-1">
            SwiftMind
          </h1>
          
          <p className="text-sm text-muted-foreground">
            Intelligent workspace platform
          </p>
          
          {/* Tenant badge for invite flows */}
          {tenantInfo && (
            <div className="flex items-center justify-center gap-2 mt-4 p-3 rounded-lg bg-muted/50 border border-border/50 backdrop-blur-sm">
              <div className="text-center">
                <p className="text-sm text-muted-foreground">You&apos;re joining</p>
                <p className="font-medium text-foreground">{tenantInfo.name}</p>
                {tenantInfo.role && (
                  <Badge variant="secondary" className="mt-1 text-xs">
                    {tenantInfo.role}
                  </Badge>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Glass Card */}
        <Card className="border-border/50 bg-card/95 backdrop-blur-xl shadow-2xl supports-[backdrop-filter]:bg-card/80">
 
          
          <CardContent className="pt-2">
            {children}
          </CardContent>
        </Card>

        {/* Footer Links */}
        <div className="mt-8 flex items-center justify-center gap-6 text-xs text-muted-foreground">
          <Link 
            href="/privacy" 
            className="hover:text-foreground transition-colors"
          >
            Privacy
          </Link>
          <Link 
            href="/terms" 
            className="hover:text-foreground transition-colors"
          >
            Terms
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * Specialized shell for error/success panels
 */
export function AuthPanelShell({ 
  title, 
  children, 
  variant = "default"
}: {
  title: string;
  children: ReactNode;
  variant?: "default" | "success" | "error";
}) {
  const variantStyles = {
    default: "",
    success: "border-green-500/20 bg-green-500/5",
    error: "border-destructive/20 bg-destructive/5"
  };

  return (
    <AuthShell
      title={title}
    >
      <div className={`p-4 rounded-lg border ${variantStyles[variant]}`}>
        {children}
      </div>
    </AuthShell>
  );
}