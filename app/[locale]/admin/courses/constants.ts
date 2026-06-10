// Delte konstanter for courses-admin. Bevisst i en server-safe modul (ingen
// 'use client'-direktiv) slik at både server-actions og CourseForm kan
// importere herfra. Next.js 16 wrapper eksporter fra 'use client'-moduler som
// placeholder-funksjoner når de brukes serverside, så `const X = 7` blir til
// en throw-funksjon — `i < X` blir `0 < function` = false og loopen iterer
// aldri. Konstanter som krysser server/client-grensen må ligge i en ren modul.

export const MAX_TEE_BOXES = 7;
