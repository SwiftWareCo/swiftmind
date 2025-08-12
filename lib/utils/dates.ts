export function formatDateTimeLocal(dateIso: string | number | Date): string {
  const d = typeof dateIso === "string" || typeof dateIso === "number" ? new Date(dateIso) : dateIso;
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(d);
  } catch {
    return new Date(d).toLocaleString();
  }
}


