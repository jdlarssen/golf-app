'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

// Numeric fields are stored as strings so React's controlled inputs preserve
// in-progress decimal entry like "72." before the user types the next digit.
// The server action converts them via Number() when reading FormData.
export type HoleData = {
  hole_number: number;
  par: string;
  stroke_index: string;
};

export type TeeBoxData = {
  name: string;
  slope: string;
  course_rating: string;
  par_total: string;
  length_meters: string;
};

export type CourseFormInitialData = {
  name: string;
  holes: HoleData[];
  teeBoxes: TeeBoxData[];
};

type Props = {
  // The server action receives FormData. Two signatures are supported here:
  // - create: (formData) => void
  // - update: (formData) => void  (bound with the course id ahead of time)
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
  initialData?: CourseFormInitialData;
  // Optional extra footer (e.g. a delete button on the edit page).
  footer?: React.ReactNode;
};

const DEFAULT_HOLES: HoleData[] = Array.from({ length: 18 }, (_, i) => ({
  hole_number: i + 1,
  par: '4',
  stroke_index: String(i + 1),
}));

const DEFAULT_TEE: TeeBoxData = {
  name: '',
  slope: '113',
  course_rating: '70.0',
  par_total: '72',
  length_meters: '',
};

const MAX_TEE_BOXES = 5;

export function CourseForm({
  action,
  submitLabel,
  initialData,
  footer,
}: Props) {
  const [holes, setHoles] = useState<HoleData[]>(
    initialData?.holes ?? DEFAULT_HOLES,
  );
  const [teeBoxes, setTeeBoxes] = useState<TeeBoxData[]>(
    initialData?.teeBoxes && initialData.teeBoxes.length > 0
      ? initialData.teeBoxes
      : [DEFAULT_TEE],
  );

  function updateHole(index: number, patch: Partial<HoleData>) {
    setHoles((prev) =>
      prev.map((h, i) => (i === index ? { ...h, ...patch } : h)),
    );
  }

  function updateTee(index: number, patch: Partial<TeeBoxData>) {
    setTeeBoxes((prev) =>
      prev.map((t, i) => (i === index ? { ...t, ...patch } : t)),
    );
  }

  function addTee() {
    if (teeBoxes.length >= MAX_TEE_BOXES) return;
    setTeeBoxes((prev) => [...prev, { ...DEFAULT_TEE }]);
  }

  function removeTee(index: number) {
    if (teeBoxes.length <= 1) return;
    setTeeBoxes((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <form action={action} className="space-y-6">
      <Input
        id="name"
        name="name"
        type="text"
        label="Navn på banen"
        placeholder="f.eks. Stiklestad Golfbane"
        defaultValue={initialData?.name ?? ''}
        required
      />

      <section>
        <h2 className="text-sm font-medium text-text mb-3">
          Hull 1–18
        </h2>
        <p className="text-xs text-muted mb-3">
          Stroke-indeks 1–18 må brukes nøyaktig én gang hver.
        </p>
        <div className="space-y-3">
          {holes.map((hole, index) => (
            <div
              key={hole.hole_number}
              className="grid grid-cols-[4rem_1fr_1fr] gap-3 items-end"
            >
              <div className="text-sm font-medium text-text pb-3">
                Hull {hole.hole_number}
              </div>
              <Input
                id={`hole_${hole.hole_number}_par`}
                name={`hole_${hole.hole_number}_par`}
                type="number"
                inputMode="numeric"
                min={3}
                max={6}
                step={1}
                label="Par"
                value={hole.par}
                onChange={(e) => updateHole(index, { par: e.target.value })}
                required
              />
              <Input
                id={`hole_${hole.hole_number}_si`}
                name={`hole_${hole.hole_number}_si`}
                type="number"
                inputMode="numeric"
                min={1}
                max={18}
                step={1}
                label="Stroke-indeks"
                value={hole.stroke_index}
                onChange={(e) =>
                  updateHole(index, { stroke_index: e.target.value })
                }
                required
              />
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium text-text mb-3">
          Tee-bokser ({teeBoxes.length}/{MAX_TEE_BOXES})
        </h2>
        <div className="space-y-4">
          {teeBoxes.map((tee, index) => (
            <div
              key={index}
              className="border border-border rounded-xl p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-text">
                  Tee-boks {index + 1}
                </span>
                {teeBoxes.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeTee(index)}
                    className="text-xs font-medium text-danger hover:opacity-80 transition-opacity"
                  >
                    Fjern
                  </button>
                )}
              </div>
              <Input
                id={`tee_${index}_name`}
                name={`tee_${index}_name`}
                type="text"
                label="Navn"
                placeholder="f.eks. Gul eller 57"
                value={tee.name}
                onChange={(e) => updateTee(index, { name: e.target.value })}
                required
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  id={`tee_${index}_slope`}
                  name={`tee_${index}_slope`}
                  type="number"
                  inputMode="numeric"
                  min={55}
                  max={155}
                  step={1}
                  label="Slope"
                  placeholder="113"
                  value={tee.slope}
                  onChange={(e) =>
                    updateTee(index, { slope: e.target.value })
                  }
                  required
                />
                <Input
                  id={`tee_${index}_cr`}
                  name={`tee_${index}_cr`}
                  type="number"
                  inputMode="decimal"
                  min={50}
                  max={80}
                  step={0.1}
                  label="Course rating"
                  placeholder="70.0"
                  value={tee.course_rating}
                  onChange={(e) =>
                    updateTee(index, { course_rating: e.target.value })
                  }
                  required
                />
              </div>
              <Input
                id={`tee_${index}_par_total`}
                name={`tee_${index}_par_total`}
                type="number"
                inputMode="numeric"
                min={60}
                max={80}
                step={1}
                label="Par total"
                placeholder="72"
                value={tee.par_total}
                onChange={(e) =>
                  updateTee(index, { par_total: e.target.value })
                }
                required
              />
              <Input
                id={`tee_${index}_length_meters`}
                name={`tee_${index}_length_meters`}
                type="number"
                inputMode="numeric"
                min={1000}
                max={12000}
                step={1}
                label="Banelengde (m)"
                hint="Valgfritt. Total bane-lengde fra denne tee-boksen."
                placeholder="6124"
                value={tee.length_meters}
                onChange={(e) =>
                  updateTee(index, { length_meters: e.target.value })
                }
              />
            </div>
          ))}
        </div>
        {teeBoxes.length < MAX_TEE_BOXES && (
          <Button
            type="button"
            variant="secondary"
            onClick={addTee}
            className="mt-3 w-full text-sm"
          >
            + Legg til tee-boks
          </Button>
        )}
      </section>

      <Button type="submit" className="w-full">
        {submitLabel}
      </Button>

      {footer}
    </form>
  );
}
