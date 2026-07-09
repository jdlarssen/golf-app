#!/usr/bin/env python3
"""Genererer den GENERERTE seksjonen i docs/schema-ground-truth.md fra
prod-snapshotet, og skriver en prod<->staging-avviksrapport til en fil.

Bruk: dok-skjema-render.py <prod.json> <staging.json> <diff-out.txt> <dato>
  - Skriver den ferdige markdown-seksjonen (inkl. START/SLUTT-markørene) til stdout.
  - Skriver avvik UTOVER kjente til <diff-out.txt> (tom fil = ingen uventede avvik).

Formatet er DETERMINISTISK (sortert, flate lister) slik at en maskin kan holde
seksjonen byte-stabil. Første kjøring mot dagens hånd-arrangerte seksjon gir
derfor en éngangs-kanoniserings-diff — den fanges i den eier-review'de docs-PR-en,
ingen stille degradering. Se #1122.
"""
import json
import sys

# Kjente prod-only SECURITY DEFINER-funksjoner (eget issue finnes) — flagges IKKE
# som uventet avvik. rls_auto_enable kom inn som prod-only ved event-trigger-pariteten.
KNOWN_ONLY_PROD_SECDEF = {"rls_auto_enable"}

PROD_REF = "glofubopddkjhymcbaph"

START_MARKER = (
    "<!-- GENERERT-SEKSJON-START — ikke rediger for hånd. Regenereres av dok-avstemmeren\n"
    "     (docs/loops/dok-avstemmeren.md, steg 1) fra prod via den kanoniske spørringen. -->"
)
END_MARKER = "<!-- GENERERT-SEKSJON-SLUTT -->"


def load(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def comparable(snap):
    rls = snap.get("rls") or []
    return {
        "tables": sorted(r["tbl"] for r in rls),
        "policies": {r["tbl"]: r["policies"] for r in rls},
        "rls": {r["tbl"]: r["rls"] for r in rls},
        "checks_total": snap.get("checks_total", 0),
        "triggers": sorted(f'{t["tbl"]}|{t["name"]}' for t in (snap.get("triggers") or [])),
        "secdef": sorted(snap.get("secdef") or []),
    }


def diff_prod_staging(prod, staging):
    """Returnerer (liste med avvik-linjer utover kjente, rls_auto_prod_only:bool)."""
    p, s = comparable(prod), comparable(staging)
    diffs = []

    for t in sorted(set(p["tables"]) - set(s["tables"])):
        diffs.append(f"tabell kun i prod: {t}")
    for t in sorted(set(s["tables"]) - set(p["tables"])):
        diffs.append(f"tabell kun i staging: {t}")

    only_prod_secdef = set(p["secdef"]) - set(s["secdef"])
    rls_auto_prod_only = "rls_auto_enable" in only_prod_secdef
    for f in sorted(only_prod_secdef - KNOWN_ONLY_PROD_SECDEF):
        diffs.append(f"SECURITY DEFINER kun i prod: {f}")
    for f in sorted(set(s["secdef"]) - set(p["secdef"])):
        diffs.append(f"SECURITY DEFINER kun i staging: {f}")

    for x in sorted(set(p["triggers"]) - set(s["triggers"])):
        diffs.append(f"trigger kun i prod: {x}")
    for x in sorted(set(s["triggers"]) - set(p["triggers"])):
        diffs.append(f"trigger kun i staging: {x}")

    if p["checks_total"] != s["checks_total"]:
        diffs.append(f'CHECK-total: prod {p["checks_total"]} vs staging {s["checks_total"]}')

    for t in sorted(set(p["tables"]) & set(s["tables"])):
        if p["policies"][t] != s["policies"].get(t):
            diffs.append(f'policy-antall {t}: prod {p["policies"][t]} vs staging {s["policies"].get(t)}')
        if p["rls"][t] != s["rls"].get(t):
            diffs.append(f'RLS-flagg {t}: prod {p["rls"][t]} vs staging {s["rls"].get(t)}')

    return diffs, rls_auto_prod_only


def render_section(prod, date, unexpected_diffs, rls_auto_prod_only):
    rls = sorted(prod.get("rls") or [], key=lambda r: r["tbl"])
    n_tables = len(rls)
    n_rls_on = sum(1 for r in rls if r["rls"])
    checks_total = prod.get("checks_total", 0)
    checks_by_tbl = prod.get("checks_by_tbl") or {}
    triggers = prod.get("triggers") or []
    secdef = sorted(prod.get("secdef") or [])
    n_trig = len(triggers)
    n_secdef = len(secdef)

    # Staging-avvik-setning
    if not unexpected_diffs and rls_auto_prod_only:
        avvik = ("Staging matcher på alt under, med ETT kjent avvik: funksjonen "
                 "`rls_auto_enable` finnes kun i prod (eget issue).")
    elif not unexpected_diffs:
        avvik = "Staging matcher prod på alt under."
    else:
        avvik = ("Staging matcher prod på alt under bortsett fra uventede avvik som er "
                 "rapportert i eget issue (se dok-skjema-kjøringen).")

    rls_hdr = (f"alle {n_tables} har RLS på" if n_rls_on == n_tables
               else f"{n_rls_on} av {n_tables} har RLS på")

    out = []
    out.append(START_MARKER)
    out.append("")
    out.append("## Generert snapshot — RLS / CHECK / triggere / SECURITY DEFINER")
    out.append("")
    out.append(f"**Kilde: prod (`{PROD_REF}`), målt {date}.** {avvik}")
    out.append("")
    out.append(f"**Totaler:** {n_tables} tabeller · {checks_total} CHECK-constraints · "
               f"{n_trig} triggere · {n_secdef} SECURITY DEFINER-funksjoner.")
    out.append("")
    out.append(f"### RLS og policy-antall per tabell ({rls_hdr})")
    out.append("")
    out.append("| Tabell | Policies |")
    out.append("|---|---|")
    for r in rls:
        cell = f"{r['policies']} ⛔" if r["policies"] == 0 else str(r["policies"])
        if not r["rls"]:
            cell += " ⚠️ RLS AV"
        out.append(f"| {r['tbl']} | {cell} |")
    out.append("")
    out.append("⛔ = RLS på uten policies → deny-all for anon/authenticated; kun service-role")
    out.append("når tabellen (bevisst lockdown for admin-/agent-tabeller). ⚠️ RLS AV = RLS ikke")
    out.append("aktivert (skal aldri skje på public-tabeller — undersøkes umiddelbart).")
    out.append("")
    out.append(f"### CHECK-constraints per tabell ({checks_total} totalt)")
    out.append("")
    check_items = " · ".join(f"{t} {checks_by_tbl[t]}" for t in sorted(checks_by_tbl))
    out.append(check_items if check_items else "(ingen CHECK-constraints)")
    out.append("")
    out.append("Fulle definisjoner: kjør den kanoniske spørringen (docs/loops/dok-avstemmeren.md).")
    out.append("")
    out.append(f"### Triggere ({n_trig}, ingen interne)")
    out.append("")
    by_tbl = {}
    for t in triggers:
        by_tbl.setdefault(t["tbl"], []).append(t["name"])
    for tbl in sorted(by_tbl):
        names = ", ".join(sorted(by_tbl[tbl]))
        out.append(f"- `{tbl}`: {names}")
    if not by_tbl:
        out.append("(ingen triggere)")
    out.append("")
    out.append(f"### SECURITY DEFINER-funksjoner ({n_secdef})")
    out.append("")
    annotated = [f"{name} (kun prod)" if (name in KNOWN_ONLY_PROD_SECDEF and rls_auto_prod_only)
                 else name for name in secdef]
    out.append(" · ".join(annotated) if annotated else "(ingen)")
    out.append("")
    out.append(END_MARKER)
    return "\n".join(out) + "\n"


def main():
    if len(sys.argv) != 5:
        sys.stderr.write("Bruk: dok-skjema-render.py <prod.json> <staging.json> <diff-out.txt> <dato>\n")
        return 2
    prod_path, staging_path, diff_out, date = sys.argv[1:5]
    prod = load(prod_path)
    staging = load(staging_path)
    diffs, rls_auto_prod_only = diff_prod_staging(prod, staging)
    with open(diff_out, "w", encoding="utf-8") as fh:
        for d in diffs:
            fh.write(d + "\n")
    sys.stdout.write(render_section(prod, date, diffs, rls_auto_prod_only))
    return 0


if __name__ == "__main__":
    sys.exit(main())
