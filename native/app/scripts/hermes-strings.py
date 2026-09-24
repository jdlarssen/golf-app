#!/usr/bin/env python3
"""Print the UTF-16LE strings in a Hermes bundle, one per line, as UTF-8 (#1983).

Usage: hermes-strings.py <main.jsbundle>

Hermes keeps two string tables. A string with even one character outside ASCII
(an `ø`, a `·`, an emoji) is stored as UTF-16LE, and `/usr/bin/strings` on macOS
only reads single-byte characters (it has no `-e`), so store-build-proof.sh
could not see that table. This scanner reads it from the raw bytes; the proof
script greps its output together with the `strings` dump.

No Hermes header parsing: the scan does not depend on the bytecode version,
which is the point. Stdlib only, so `--upload-only` still needs no Node.

Accepted characters are deliberately narrower than "anything from U+00A0 up".
That rule reads binary as text: nearly every 16-bit value qualifies, and on
1.1.0 (3) it produced 71 182 runs (2.7 MB) of noise with ø/å scattered through
it, which would let a broken reader pass the æ/ø/å check. Every token the proof
looks for is ASCII (or æ/ø/å), and ASCII is always accepted, so a narrower set
can split a run at a symbol but never splits a token.
"""
import re
import sys

# Printable ASCII and Latin-1, general punctuation (dashes, quotes, ZWJ),
# currency, the symbol/arrow/dingbat blocks, emoji variation selectors and the
# astral emoji planes. Surrogates are never listed: valid pairs are decoded to
# astral code points before matching, lone ones break the run.
TEXT = (
    "\x20-\x7e\xa0-\xff"
    " -⁯₠-⃏℀-➿⬀-⯿"
    "︎️"
    "\U0001f000-\U0001faff"
)
# Four characters minimum, the same threshold as `strings`. A run must also
# hold one Latin-1 character, since a run without one cannot contain any token
# the proof greps for (drops pure symbol noise from misread ASCII).
RUN = re.compile("[" + TEXT + "]{4,}")
LATIN1 = re.compile("[\x20-\x7e\xa0-\xff]")


def runs(data):
    # Both byte alignments. On 1.1.0 (3) every real string sits at an even
    # offset; the odd pass found 74 runs (674 bytes), all noise. It stays
    # because the scanner does not assume how Hermes aligns the table:
    # reading too much is safe, missing a string is not.
    for start in (0, 1):
        chunk = data[start:]
        chunk = chunk[: len(chunk) - len(chunk) % 2]
        text = chunk.decode("utf-16-le", "surrogatepass")
        for match in RUN.finditer(text):
            if LATIN1.search(match.group()):
                yield match.group()


def main():
    if len(sys.argv) != 2:
        sys.stderr.write("Bruk: hermes-strings.py <main.jsbundle>\n")
        return 2
    with open(sys.argv[1], "rb") as handle:
        data = handle.read()
    out = sys.stdout.buffer
    for run in runs(data):
        out.write(run.encode("utf-8", "replace") + b"\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
