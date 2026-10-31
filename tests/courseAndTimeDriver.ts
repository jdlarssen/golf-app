import { fireEvent, screen } from '@testing-library/react';

/**
 * Shared drivers for «Hvor og når?» (#2448): the course search, the tee
 * buttons and the tee-off quick picks in BasicsSection. The wizard and the
 * edit-form tests choose by id, as they did with the old dropdowns.
 */

/** Chooses a course through the search (the list opens on focus). */
export function chooseCourse(courseId: string) {
  fireEvent.focus(screen.getByTestId('course-search'));
  const option = screen
    .getAllByTestId('course-search-option')
    .find((el) => el.dataset.courseId === courseId);
  if (!option) throw new Error(`chooseCourse: no course ${courseId} in the search list`);
  fireEvent.click(option);
}

/** Presses the tee button for `teeId`. */
export function chooseTee(teeId: string) {
  const button = screen
    .getAllByTestId('tee-button')
    .find((el) => el.dataset.teeId === teeId);
  if (!button) throw new Error(`chooseTee: no button for tee ${teeId}`);
  fireEvent.click(button);
}

/** Sets the tee-off («YYYY-MM-DDTHH:mm») through «Annen dag» and «Annen tid». */
export function setTeeOff(value: string) {
  const [day, time] = value.split('T');
  fireEvent.click(screen.getByRole('radio', { name: /^annen dag$/i }));
  fireEvent.change(screen.getByLabelText(/^velg dag$/i), { target: { value: day } });
  fireEvent.click(screen.getByRole('radio', { name: /^annen tid$/i }));
  fireEvent.change(screen.getByLabelText(/^velg tid$/i), { target: { value: time } });
}
