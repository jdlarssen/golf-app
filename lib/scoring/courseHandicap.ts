export interface CourseHandicapInput {
  hcpIndex: number;
  slope: number;
  courseRating: number;
  par: number;
}

export function calculateCourseHandicap(input: CourseHandicapInput): number {
  const raw = input.hcpIndex * (input.slope / 113) + (input.courseRating - input.par);
  return Math.round(raw);
}

export function applyAllowance(courseHandicap: number, percent: number): number {
  return Math.round(courseHandicap * (percent / 100));
}
