// lib/moderation/textLimits.ts
// #3019: the length caps that were missing on text other players see. The
// database enforces them in the 0259 guard triggers (error 'text_too_long');
// `textLimits.sync.test.ts` holds the numbers equal. Prod's longest values
// on 28.11.2026 were 26 (name), 12 (nickname), 35 (round), 32 (course) and
// 21 (tee) characters.
export const PLAYER_NAME_MAX = 60;
export const NICKNAME_MAX = 60;
export const GAME_NAME_MAX = 120;
export const COURSE_NAME_MAX = 120;
export const TEE_NAME_MAX = 120;
