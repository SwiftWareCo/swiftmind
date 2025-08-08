export default function AppNotFound() {
  return (
    <div className="flex h-[60vh] items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-semibold mb-2">Tenant Not Found</h1>
        <p className="text-muted-foreground">We could not resolve a tenant for this request.</p>
      </div>
    </div>
  );
}


