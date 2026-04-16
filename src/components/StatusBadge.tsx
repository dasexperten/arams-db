const styles: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  CONFIRMED: "bg-blue-100 text-blue-700",
  FULFILLED: "bg-green-100 text-green-700",
  CANCELLED: "bg-red-100 text-red-700",
};

export default function StatusBadge({ status }: { status: string }) {
  const cls = styles[status] ?? "bg-slate-100 text-slate-600";
  return <span className={`badge ${cls}`}>{status}</span>;
}
