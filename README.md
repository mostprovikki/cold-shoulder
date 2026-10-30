# Cold Shoulder

A puzzle about cats who would like to be left alone. Every cat wants its own row, its own column and its own box, and none of them will tolerate another cat close enough to notice. You place them. They judge you. Nap time is the reward.

Play: https://mostprovikki.github.io/cold-shoulder/

## Rules

- One cat per row, per column and per box.
- No two cats touch, not even at a corner.

## Checks

```
node build.js                  # injects src/engine.js into index.html and generator.html
node tests/engine.test.js      # puzzle engine
node tests/site-check.mjs      # headless Chrome UI gate (needs Chrome)
node tests/sounds.test.mjs     # sound assets
```

`node tests/make-og.mjs` regenerates the social card `og.png`.

## Credits

- Sounds: see `assets/sounds/CREDITS.md`.
- Font (Fredoka): see `assets/fonts/OFL.txt`.
