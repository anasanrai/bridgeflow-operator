import { LeadsTable } from "../components/LeadsTable";

export const metadata = {
  title: "Leads · BridgeFlow Operator",
};

export default function LeadsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">Leads</h1>
          <p className="text-sm text-muted mt-1">
            Every prospect that passed through the pipeline — scored, decided, timestamped.
          </p>
        </div>
      </div>
      <LeadsTable />
    </div>
  );
}
