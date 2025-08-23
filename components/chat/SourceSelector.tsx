"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Mail, Database, ChevronDown, Settings } from "lucide-react";

export type SourceConfig = {
  gmail?: boolean;
  knowledge?: boolean;
};

interface Source {
  id: keyof SourceConfig;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  enabled: boolean;
  available: boolean;
}

interface SourceSelectorProps {
  value: SourceConfig;
  onChange: (config: SourceConfig) => void;
  gmailAvailable?: boolean;
}

export function SourceSelector({ value, onChange, gmailAvailable = true }: SourceSelectorProps) {
  const [open, setOpen] = useState(false);

  const sources: Source[] = [
    {
      id: "knowledge",
      name: "Knowledge Base",
      icon: Database,
      description: "Search uploaded documents and files",
      enabled: value.knowledge ?? true,
      available: true,
    },
    {
      id: "gmail",
      name: "Gmail",
      icon: Mail,
      description: "Search your email messages",
      enabled: value.gmail ?? false,
      available: gmailAvailable,
    },
  ];

  const enabledCount = sources.filter(s => s.enabled && s.available).length;
  const availableCount = sources.filter(s => s.available).length;

  const handleToggle = (sourceId: keyof SourceConfig, enabled: boolean) => {
    onChange({
      ...value,
      [sourceId]: enabled,
    });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button 
          variant="outline" 
          size="sm"
          className="h-8 px-3 gap-2 text-xs font-normal"
        >
          <Settings className="h-3 w-3" />
          <span>
            {enabledCount === availableCount ? "All sources" : `${enabledCount}/${availableCount} sources`}
          </span>
          <ChevronDown className="h-3 w-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="p-4">
          <div className="space-y-1 mb-3">
            <h4 className="font-medium leading-none">Search Sources</h4>
            <p className="text-sm text-muted-foreground">
              Choose which sources to search when answering your questions
            </p>
          </div>
          
          <Separator className="mb-3" />
          
          <div className="space-y-3">
            {sources.map((source) => (
              <div key={source.id} className="flex items-start gap-3">
                <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10 flex-shrink-0 mt-0.5">
                  <source.icon className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{source.name}</span>
                      {!source.available && (
                        <Badge variant="secondary" className="text-xs">
                          Not Connected
                        </Badge>
                      )}
                    </div>
                    <Switch
                      checked={source.enabled && source.available}
                      onCheckedChange={(checked) => handleToggle(source.id, checked)}
                      disabled={!source.available}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">{source.description}</p>
                  {!source.available && source.id === "gmail" && (
                    <p className="text-xs text-amber-600">
                      Connect Gmail in Settings → Integrations to enable
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
          
          <Separator className="my-3" />
          
          <div className="text-xs text-muted-foreground">
            <p>
              <strong>Knowledge Base</strong> is always searched first. Additional sources provide extra context.
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
