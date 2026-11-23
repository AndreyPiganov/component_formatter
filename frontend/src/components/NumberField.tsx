export function NumberField({ label, value, min, onChange }: {
  label: string; value: number; min?: number; onChange: (value: number) => void;
}) {
  return <label className="number-field">
    <span>{label}</span>
    <input type="number" key={value} defaultValue={value} min={min} onBlur={(event) => {
      const next = event.target.valueAsNumber;
      if (Number.isFinite(next) && Math.abs(next) < 1_000_000 && (min === undefined || next >= min)) {
        if (next !== value) onChange(next);
      } else {
        event.target.value = String(value);
      }
    }} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} />
  </label>;
}
