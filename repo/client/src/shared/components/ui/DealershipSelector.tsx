interface DealershipSelectorProps {
  dealerships: Array<{ _id: string; name: string }>;
  value: string;
  onChange: (id: string) => void;
}

export default function DealershipSelector({ dealerships, value, onChange }: DealershipSelectorProps) {
  if (dealerships.length === 0) return null;

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4 flex items-center gap-3">
      <svg className="h-5 w-5 text-amber-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span className="text-sm text-amber-800">Admin view &mdash; select a dealership:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input-field text-sm py-1 w-auto"
      >
        {dealerships.map((d) => (
          <option key={d._id} value={d._id}>{d.name}</option>
        ))}
      </select>
    </div>
  );
}
