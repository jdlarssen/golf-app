'use client';

import { Button } from '@/components/ui/Button';

type Props = {
  // The delete action arrives pre-bound with the course id; the rendered form
  // just needs to submit empty FormData to trigger it.
  deleteAction: () => void | Promise<void>;
  courseName: string;
};

export function DeleteCourseButton({ deleteAction, courseName }: Props) {
  return (
    <form
      action={deleteAction}
      onSubmit={(event) => {
        const ok = window.confirm(
          `Er du sikker på at du vil slette banen «${courseName}»? Dette kan ikke angres.`,
        );
        if (!ok) {
          event.preventDefault();
        }
      }}
    >
      <Button type="submit" variant="danger" className="w-full text-sm">
        Slett bane
      </Button>
    </form>
  );
}
