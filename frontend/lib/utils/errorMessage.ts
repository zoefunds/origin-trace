export function errorMessage(
  err: unknown,
  fallback = "Something went wrong"
): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err.trim()) return err;
  const anyErr = err as {
    shortMessage?: string;
    message?: string;
    cause?: { message?: string };
  } | null;
  return (
    anyErr?.shortMessage ||
    anyErr?.cause?.message ||
    anyErr?.message ||
    fallback
  );
}
