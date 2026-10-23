# Pal the pug — design iterations

Each round: render `docs/mascot/sheet.html` with `node scripts/mascot-render.mjs sheet`, look at
`sheet.png` / `sheet-dark.png`, write down what's wrong, fix, render again.

## Round 1 — first drawing

All shapes are bezier `path`s (an organic `blob()` helper replaces circles/ellipses; it adds a little
wobble so nothing is perfectly round). Variable line weight comes from an ink copy of each shape
offset 1.8 units down, so the outline is ~3.2 thick at the bottom and ~1.5 on top. Cel shading is a
flat darker band clipped to the bottom of each shape and a light crescent top-left.

What was wrong:

- The dark mask was one big blob that swallowed the eyes: the face read as a dark disc, not a pug.
- The head was an egg / helmet: too tall, top too pointed.
- Ears were small and sat low, like flaps on a hat.
- Front legs were long planks.
- The collar tag was drawn behind the front legs, so only a red sliver showed.
- Without the animation script the default drawing had closed eyelids and an open mouth
  (visible in the ¾ view) — the static markup must already be the "sit" face.
- At 32 px and 16 px the full body was mush.

## Round 2 — face and proportions

- Head wider and flatter on top (28–172 wide, 26–137 tall); jowls sag a little at the corners.
- Mask reshaped into two eye patches joined over a muzzle, with a dip between the eyes; lighter
  colour (`#655149`) so brows and mouth read on it.
- Ears ~30 % bigger, set higher, folded outward with a lighter inner fold.
- Front legs shorter and chubbier; tag moved in front of the legs.
- Static markup now defaults to open eyes (eyelids pre-scaled to 2 %) and a closed mouth.
- Bug found while reviewing: a regex edit replaced the palette colour instead of the mask path
  (all masks rendered black). Fixed and re-rendered.

What was still wrong:

- A light ring around each eye made it look like he wears glasses.
- ¾ view barely turned.
- Side view: tall egg head, ear like a cat's triangle on top.
- Small sizes still unreadable.

## Round 3 — eyes, turnaround, small sizes

- Eye rim is now a thin, darker ring (mask shade) instead of a light one; the light colour moved
  to the lower-lid crescent only, as asked ("ขอบตาล่างสีอ่อน"). Two highlights (large top-left,
  small bottom-right) are what make the eyes look wet and alive.
- ¾ view: face features shifted further toward the near side, far eye narrowed to 74 %, far ear
  turned and shrunk, body offset the other way.
- Side view: rounder, wider skull; flat face at the front; the ear now folds at the back of the
  skull instead of standing on top.
- New simplified icon head (`PushPugIconHead`): head + ears + mask + big eyes + nose only, thicker
  ink, no wrinkles, collar or blush below 20 px. Readable at 16 px; the full-body pug isn't, so
  every small surface uses the icon head.
- Checked in dark mode: cream fur and the warm ink stay clear on dark surfaces; the collar teal
  and tag coral match the PushPug accents in both themes.

Known compromises:

- The ¾ view is the front rig with shifted features, not a separate drawing; good enough for
  a turnaround, not used in the product.
- The belly-rub easter egg turns the whole front-view rig upside down rather than using a
  dedicated drawing. It's a 3-second gag and reads as "rolled over".

## Round 4 — motion review (from the GIFs)

Every pose is recorded frame-exact (`node scripts/mascot-render.mjs gifs`: GSAP's clock is stepped
by hand at 25 fps, so frames don't depend on machine speed) and reviewed as contact sheets.

- **success**: the jump-spin rotated around the feet, so the pug swung out of frame. Added a
  `p-spin` layer pivoting at the body centre and lowered the jump from 62 to 40 units. Now:
  crouch → stretch up → spin → squash on landing → elastic recover, ears and tag keep swinging.
- **welcome / pass**: the raised paw was drawn behind the head, so the wave and the "thumbs up"
  were invisible. Front legs now render in front of the head (the jowls end above the legs, so the
  sitting pose is unchanged).
- **sleep**: with the legs in front, the forelegs and the tag covered the face. In sleep the
  forelegs fold short (scaleY .55) under the chin and the tag hides behind the head: "chin on paws".
- **alert**: reads right — flinch (anticipation), stretch up with wide eyes, two barks with sound
  lines, fast tail.
- **check / conflict / fail / merge**: timing kept; the head-tilt in conflict is deliberately slow
  (1.1 s, sine) and the "?" pops with a back-out overshoot.
- Screenshots of the app caught the pug mid-run: GSAP's lag smoothing slows its clock when headless
  Chrome's virtual time jumps, so the screenshot harness turns lag smoothing off.
- The "merged" hero now stays 3.6 s (was 2.6 s) so the jump-spin-land finishes before it fades.

## Round 5 — new direction: flat graphic head (user review)

User feedback on rounds 1–4: "not pretty, not natural". Honest diagnosis: the hand-drawn, cel-shaded
look depends on fluid hand-made line work that I can only approximate by typing coordinates, and
whole-body poses made from rotating the same parts looked stiff.

- Two reference images from the user were found online (one has a stock-site watermark); they were
  used only as a *style* reference, not traced or copied, because they can't be used as a mascot
  without a licence.
- New style: flat graphics — one ink colour (`#3b2230`) and one stroke weight everywhere, two flat
  tones per material, big glossy eyes on a lighter eye patch, dark muzzle with whisker dots, forehead
  diamond, folded ears. First sample had a body; the user asked to drop it: **only the head, with
  expressions carrying the story.**
- Expression sheet first (10 faces), reviewed with the user. Fixes from that review: "ears up" looked
  like cat ears → lifted folded ears instead; sniff lines moved off the eye; eyes moved up out of the
  muzzle; blush stuck out past the face outline → blush moved inward and clipped to the head.
- Rig: ears, brows and the mouth line morph between variants (MorphSVG); eyes switch between open
  (with a movable pupil group that blinks), closed, happy, heart and a heavy "sad" lid; open mouths
  pop in with a scale; props (z's, bark lines, "?", tear, rope + knot, stars, hearts) are separate.
- Motion recorded and checked frame by frame: success (crouch → jump-spin → squash landing → stars),
  alert (flinch → pop up → two barks), sleep (sway + z's), fail (sink + tears), love (heart eyes,
  floating hearts), welcome (pop in with overshoot, then a wink).

