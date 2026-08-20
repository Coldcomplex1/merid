#!/usr/bin/env python3
"""Stage 04 - score every candidate against the meaning it is supposed to show.

This is the stage that decides which pictures are wrong, and it is the reason
the pipeline is worth having at all. Stage 03 asks three archives for
photographs matching a query; archives return what matches the WORDS, and the
words are ambiguous even after stage 02 has done its best. Something has to look
at the picture.

CLIP does. It embeds an image and a piece of text into one space, so the cosine
between them is roughly "does this picture show what this sentence describes".
Two tests, and the second matters more than the first:

  absolute   cos(image, "a photo of {word}, {gloss}") must clear a floor. Cheap,
             and it catches candidates that are simply not of anything relevant.

  margin     that score must beat the best of the entry's distractors by a
             margin. This is the one that fixes "spring". A photograph of a
             coiled spring scores respectably against any sentence containing
             the word "spring" - the floor will not reject it, and no amount of
             rewording the positive prompt will either. It is only obviously
             wrong once something notices it scores BETTER against "metal coil".
             Without the distractors from stage 02 this stage has a threshold
             and no discrimination.

Nothing here is a verdict. Survivors go to a person in stage 05; what this
stage really buys is ordering, so the doubtful cases are looked at first and the
obvious ones can be waved through.

Free: ViT-B-32 is ~150MB and runs on CPU. Roughly 15-25 minutes for the whole
candidate set on a laptop.

Usage:
  python3 scripts/visual/04-rank.py [--limit N] [--model ViT-B-32]
"""
import argparse
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STATE = ROOT / "scripts" / "visual" / "state"
CANDIDATES = STATE / "candidates.json"
OUT = STATE / "ranked.json"

# Calibrate on a sample before trusting these. They are a starting point, not a
# result: the right floor depends on the model and on how literal the queries
# stage 02 produced turned out to be.
FLOOR = float(os.environ.get("MERID_CLIP_FLOOR", "0.24"))
MARGIN = float(os.environ.get("MERID_CLIP_MARGIN", "0.03"))


def read_json_text(path):
    """Read a JSON file as UTF-8, whatever the machine's locale says.

    Path.read_text() defaults to the locale encoding, which on Windows is
    cp1252. Everything this pipeline writes is UTF-8 and carries names from
    Wikimedia and Pexels - "Müller", "Sørensen" - so on a Windows box the
    default decoder hits a byte it has no character for and the stage dies
    before it has scored anything. The Node stages all pass 'utf8' explicitly;
    this is the same rule, stated where Python needs it stated.
    """
    return path.read_text(encoding="utf-8")


def write_json_text(path, value):
    """Write JSON as UTF-8, and let non-ASCII stay non-ASCII.

    ensure_ascii=False keeps the file readable and matches what the Node
    stages produce, so the same names survive a round trip through both.
    """
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def load_model(name, pretrained):
    import torch
    import open_clip

    model, _, preprocess = open_clip.create_model_and_transforms(
        name, pretrained=pretrained
    )
    model.eval()
    torch.set_grad_enabled(False)
    return model, preprocess, open_clip.get_tokenizer(name)


def gloss_for(entry):
    """The positive prompt: the word plus the meaning the card will print.

    Not the word alone. "a photo of spring" is the ambiguity we are trying to
    resolve, so feeding it back in as the thing to match against would measure
    the wrong quantity.
    """
    definition = (entry.get("definition") or "").strip().rstrip(".")
    word = entry.get("word") or ""
    if not definition:
        return "a photo of {}".format(word)
    return "a photo of {}, {}".format(word, definition[:110])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--model", default=os.environ.get("MERID_CLIP_MODEL", "ViT-B-32"))
    ap.add_argument(
        "--pretrained",
        default=os.environ.get("MERID_CLIP_PRETRAINED", "openai"),
        help="'none' builds the architecture with random weights: exercises this "
             "script without downloading anything, and produces meaningless scores.",
    )
    args = ap.parse_args()

    if not CANDIDATES.exists():
        sys.exit("[04] run 03-fetch.mjs first - no candidates.json")

    import torch
    from PIL import Image

    candidates = json.loads(read_json_text(CANDIDATES))
    entries = candidates.get("entries", {})

    # Every entry needs its own words, which live with the extension's CSVs.
    # Rather than parse them here in a second language, stage 03 already wrote
    # the query and distractors next to each candidate list.
    slugs = [s for s, e in entries.items() if e.get("candidates")]
    # No candidates is stage 03 having found nothing, not a quiet success. Left
    # to continue, this writes an empty ranked.json and the failure only shows
    # up in stage 05, two commands from its cause.
    if not slugs:
        sys.exit(
            "[04] no candidates to score - stage 03 downloaded none.\n"
            "      Re-run: node scripts/visual/03-fetch.mjs"
        )
    if args.limit:
        slugs = slugs[: args.limit]
    print("[04] {} entries with candidates".format(len(slugs)))

    pretrained = None if args.pretrained.lower() == "none" else args.pretrained
    print("[04] loading {} ({})".format(args.model, pretrained or "random weights"))
    model, preprocess, tokenize = load_model(args.model, pretrained)

    result = {"v": 1, "floor": FLOOR, "margin": MARGIN, "entries": {}}
    if OUT.exists():
        try:
            result = json.loads(read_json_text(OUT))
            result.setdefault("entries", {})
        except Exception:
            pass

    done = 0
    for slug in slugs:
        if slug in result["entries"]:
            continue
        entry = entries[slug]
        cands = entry.get("candidates", [])
        if not cands:
            continue

        # Against the DEFINITION, not the query that found the pictures.
        #
        # This scored against entry["query"] until it was noticed that the check
        # was circular: stage 02 invents a query, stage 03 fetches what matches
        # it, and stage 04 then confirmed those matched the query. They always
        # did. The definition - the words the learner reads under the picture -
        # was never part of the test, so "skirt: evade a question" passed with a
        # photograph of a hiking trail, because the trail did match "hiking
        # trail going around mountain base".
        positive = gloss_for(entry)
        negatives = [n for n in entry.get("negative", []) if n][:6]
        prompts = [positive] + ["a photo of " + n for n in negatives]

        text_features = model.encode_text(tokenize(prompts))
        text_features = text_features / text_features.norm(dim=-1, keepdim=True)

        scored = []
        for c in cands:
            path = STATE / c["file"]
            if not path.exists():
                continue
            try:
                image = Image.open(path).convert("RGB")
            except Exception:
                # A truncated download is a candidate we do not have, not a
                # reason to lose the entry.
                continue
            feat = model.encode_image(preprocess(image).unsqueeze(0))
            feat = feat / feat.norm(dim=-1, keepdim=True)
            sims = (feat @ text_features.T).squeeze(0).tolist()
            if isinstance(sims, float):
                sims = [sims]
            pos = sims[0]
            neg = max(sims[1:]) if len(sims) > 1 else None
            scored.append(
                {
                    **c,
                    "score": round(pos, 4),
                    "distractor": None if neg is None else round(neg, 4),
                    "margin": None if neg is None else round(pos - neg, 4),
                }
            )

        scored.sort(key=lambda s: -s["score"])
        # A candidate is "clear" when it passes both tests. The margin test is
        # skipped when stage 02 found no confusable senses to name - there is
        # nothing to be confused with.
        for s in scored:
            s["clear"] = bool(
                s["score"] >= FLOOR and (s["margin"] is None or s["margin"] >= MARGIN)
            )

        best = scored[0]["score"] if scored else 0.0
        result["entries"][slug] = {
            "query": entry.get("query", ""),
            "negative": negatives,
            "best": round(best, 4),
            "anyClear": any(s["clear"] for s in scored),
            "candidates": scored,
        }
        done += 1
        if done % 25 == 0:
            write_json_text(OUT, result)
            print("[04] {}/{}".format(done, len(slugs)))

    write_json_text(OUT, result)

    total = len(result["entries"])
    clear = sum(1 for e in result["entries"].values() if e["anyClear"])
    print("[04] scored {} entries ({} new)".format(total, done))
    print("[04] {} have at least one candidate clearing both tests, {} do not".format(
        clear, total - clear))

    # Where the scores actually landed. The floor is a guess until it has been
    # held against real numbers, and the right value depends on the model and on
    # how literal the definitions are - not on anything that can be decided in
    # advance. Printing it here means nobody has to go and compute it.
    bests = sorted(e["best"] for e in result["entries"].values())
    if bests:
        def pct(p):
            return bests[min(len(bests) - 1, int(len(bests) * p))]
        print("[04] best-candidate score: min {:.3f} | p10 {:.3f} | median {:.3f} "
              "| p90 {:.3f} | max {:.3f}".format(
                  bests[0], pct(0.10), pct(0.50), pct(0.90), bests[-1]))
        print("[04] floor is {:.2f}; {} of {} entries have their best above it".format(
            FLOOR, sum(1 for b in bests if b >= FLOOR), len(bests)))
        if clear < total * 0.25:
            print("[04] Most entries cleared nothing. If the pictures look right when you "
                  "run 05 --all,\n     the floor is too high: MERID_CLIP_FLOOR=0.20 and score again.")
    print("[04] wrote {}".format(OUT))
    if pretrained is None:
        print("[04] NOTE: random weights - these scores mean nothing, this was a dry run")


if __name__ == "__main__":
    main()
