# Forge-evaluering: Rediger en publisert lansering — #993

**Verdikt: ACCEPT**

Commit under review: `254047e0` (feat(lanseringer): edit a published launch + propagate to sent notifications). All 4 gates pass locally (Node 22), and SK4/SK5/SK6/SK10 were independently re-verified against the live staging DB (project `snwmueecmfqqdurxedxv`) — the RPC's atomic dual-write, key-removal-when-cleared, read/archived preservation, 0-row raise, and service_role-only privileges all behave exactly as specified. No blocking issues found.

## Suksesskriterier

| Krit. | Status | Bevis |
|---|---|---|
| SK1 — Inngang per element | PASS | `page.tsx:273-280` — `<Link href={/admin/lanseringer/${u.id}/rediger}>` (44px tap-target) per item in `PreviousUpdatesList`. |
| SK2 — Forhåndsutfylt skjema | PASS | `[id]/rediger/page.tsx`: `maybeSingle` read → `if (!update) notFound()` (l.48); `defaultValue` on title/body/link/cta_label (l.83/100/112/122); hidden `<input name="id">` (l.76). |
| SK3 — Oppdaterer kilden, 1 rad | PASS | RPC `0124:43-53` updates `product_updates`, `get diagnostics v_source_rows`, raises `product_update_not_found` on 0. Live test: source row → NEW title/body/link=NULL. 0-id → RAISED `product_update_not_found`. Action treats RPC error as `edit_failed` (no silent 0-row success). |
| SK4 — Propagerer til alle varsler | PASS | RPC `0124:55-64` matches `kind='product_update' AND payload->>'source_id'=p_id`. Live test (unread+read+archived copies): all 3 → NEW title; `link`/`cta_label` keys REMOVED (`payload - 'link' - 'cta_label'` + conditional build) — `link_present=f`, `cta_present=f`; source_id preserved. |
| SK5 — Atomisk + stille | PASS | Single plpgsql function = one transaction; raise on 0 source rolls back (verified). `read_at`/`archived_at` never written — live test: read copy kept `read_at=2026-06-01`, archived copy kept `archived_at=2026-06-03`. |
| SK6 — Authz | PASS | Page + action call `requireAdmin` (`rediger/page.tsx:28`, `actions.ts:64`). Live `has_function_privilege`: anon=**false**, authenticated=**false**, public=**false**, service_role=**true**. `product_updates` has no UPDATE policy → hostile direct PATCH/RPC blocked (trap #3). |
| SK7 — Validering via delt validator | PASS | Both `publishProductUpdateAction` and `editProductUpdateAction` call `validateProductUpdateInput` (`actions.ts:30,72`). Parent commit had inline title/body/link/cta rules in publish — removed and centralized; one rule home (trap #4). |
| SK8 — i18n | PASS | All 8 keys present + identical structure in `no.json` + `en.json` under `admin.launches` (editLabel/editTitle/editSubtitle/editPropagationNote/editButton/editingBusy, errors.edit_failed, success.edited). Both files parse. No hardcoded NB in new component code (the `Lenke:` literal at `page.tsx:269` is pre-existing, untouched by this commit). |
| SK9 — Tester + suite grønn | PASS | `edit.test.ts` (RPC call-form + null passthrough + count coercion + error throw), `validateUpdateInput.test.ts` (4 error codes + trim/null), `actions.test.ts` (edit auth-gate + missing-id + validation + happy-path-with-count). Targeted run 38/38; broader publish+notifications run 132/132 (no publish regression). |
| SK10 — Migrasjon verifisert på staging | PASS | `supabase_migrations.schema_migrations` has version `20260630170637` name `edit_product_update`. RPC exists, updates both tables, not executable by authenticated/anon (all re-confirmed live this evaluation). |

## Gate-resultater (Node 22.23.0)

| Gate | Resultat |
|---|---|
| `npx tsc --noEmit` | **PASS** (exit 0, no output) |
| `npx eslint <8 changed files>` | **PASS** (exit 0, no output) |
| `npx vitest run lib/productUpdates/ "app/[locale]/admin/lanseringer/"` | **PASS** — 5 files, 38 tests |
| `npm run build` | **PASS** (exit 0, full route tree incl. `/[locale]/admin/lanseringer/[id]/rediger` compiled under PPR/cacheComponents) |

## Independent live-DB verification (staging, rolled back, 0 residue)

- Seeded 1 `product_updates` row + 3 notification copies (unread/read/archived), ran `edit_product_update(... , NULL, NULL)`, asserted, then `RAISE` to roll back. Result: `RPC_RETURN=3`; source NEW title/body, link=NULL; all 3 copies NEW title; link/cta keys removed; source_id preserved; read_at + archived_at preserved.
- `edit_product_update('0000…', …)` → raised `product_update_not_found` (atomic-or-nothing).
- `has_function_privilege` confirms service_role-only.

## Notater / mindre avvik (ikke blokkerende)

1. **SECURITY DEFINER vs contract's "SECURITY INVOKER".** The contract design-note (l.15) says `SECURITY INVOKER`; the migration uses `security definer`. This is a deviation from the literal wording but is the *correct* choice and is documented in the migration header — an INVOKER function run by `service_role` would also bypass RLS, but DEFINER is the conventional, explicit form here; the security boundary (service_role-only EXECUTE) is enforced by the grants, which are correct. No security impact. Worth a one-line mention in the closing comment under «Teknisk» as a design deviation.
2. **No dedicated `error.tsx` in the lanseringer subtree** — covered by the ancestor `app/[locale]/error.tsx` boundary, so trap #5 ("every route needs an error.tsx") is satisfied transitively; `notFound()` renders the not-found UI, not a raw 500.
3. **`get diagnostics` for notif count is informational only** — 0 notification rows is legitimate (launch published before any users) and the action surfaces it as `?notifs=0`; not an error condition. Correctly handled.
