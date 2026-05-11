'use client';

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
      <button
        type="submit"
        className="w-full min-h-[44px] text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg px-4 py-2.5 transition-colors border border-red-200 dark:border-red-900"
      >
        Slett bane
      </button>
    </form>
  );
}
