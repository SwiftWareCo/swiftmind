"use client";

export function TypingDots() {
  return (
    <div className="flex items-center gap-1 pl-1 pt-4 overflow-hidden">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-200ms]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-100ms]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
    </div>
  );
}


