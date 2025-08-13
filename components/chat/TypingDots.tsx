"use client";

export function TypingDots() {
  return (
    <div className="inline-flex items-center gap-1">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-200ms]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-100ms]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
      <span className="sr-only">Assistant is typing</span>
    </div>
  );
}


