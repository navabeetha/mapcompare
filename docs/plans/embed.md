# Plan: embed code in the Share modal

Status: **designed 2026-11-10, not built.** Waiting on the four decisions at
the bottom. Once they're made, build it test-first.

## Facts checked

- GitHub Pages sends no `X-Frame-Options` or CSP header, so the site works
  inside an `<iframe>` (checked with `curl -I` on the live site).
- Two things in the app would be bad inside someone else's page:
  - the Welcome modal opens on every load (`aboutOpened` in `App.tsx`,
    `useDisclosure(true)`);
  - the mouse wheel zooms the map (the custom handler in `MapPane.tsx`). A
    reader scrolling past the embed would get stuck zooming it.

## Where it will and won't work

- **Works** anywhere that accepts pasted iframe HTML: your own site,
  self-hosted WordPress, Ghost, Squarespace and Webflow code blocks, Notion's
  /embed block, most blog and course platforms.
- **Won't work** on Medium, Substack, LinkedIn, X, Facebook, Reddit or Google
  Slides. They only allow embeds from providers they've approved, so plain
  iframes are blocked. There, the link and the image are the way to share,
  and the modal should say so.

## Behaviour (proposed)

**Address:** `https://navabeetha.github.io/mapcompare/?embed=1#v=1.<code>`,
or `?embed=1&project=<id>` for an Explore comparison. `?embed=1` is a third
mode next to `tool` and `view` (`mode.ts`).

**What the embed shows**
- Both maps, the split bar, scale bars, credits, shapes, grid and labels, as
  they are in the shared view.
- An "Open in MapCompare" button in a corner that opens the full app in a
  new tab.

**What it leaves out**
- The header, search, drawing tools, the Explore menu, Share, the Welcome
  modal and most notifications.
- Without search, embeds never send requests to Nominatim, which has strict
  usage limits.

**What readers can do in it**
- Pan each map and drag the split bar.
- Zoom with the + and − buttons or by pinching. The zoom stays matched
  between the maps, as in the app.
- The mouse wheel only zooms with Ctrl or ⌘ held. Without it, a hint shows
  ("Hold Ctrl to zoom") and the page scrolls as normal.

**The rule that stays**
- Map credits are always visible, at any embed size (OpenStreetMap licence,
  Esri terms).

**What the embed points to**
- By default, the view on screen (the same `#v=` code as the link). It's a
  snapshot and never changes.
- For a comparison in Explore, the "This view / Explore comparison" switch
  in the Link section also picks what the embed points to. An Explore embed
  follows the published comparison, so later edits show in every embed of
  it. If it's removed from Explore, the embed shows "This comparison is no
  longer available" with a link to the site, not a random comparison.

**Size**
- "Responsive": full width at 16:9, which suits blogs.
- "Fixed": width and height boxes, default 800 × 450.
- Below about 400 px wide the split gets cramped but still works.

**The code**
```html
<iframe src="https://navabeetha.github.io/mapcompare/?embed=1#v=1.…"
  title="Amsterdam vs Venice: MapCompare" width="800" height="450"
  style="border:0" loading="lazy" allow="fullscreen"></iframe>
```
The responsive version wraps it in a `div` with `aspect-ratio: 16 / 9`.

**In the Share modal:** an "EMBED" section under the link, with:
- the size choice;
- the code in a read-only box;
- Copy code;
- a "Preview" link that opens the embed address in a new tab. A live preview
  inside the modal would load the whole app a second time.

## Tests and checks

- Test first: a pure `embedCode(url, title, size)` covering size, escaping
  the title (quotes, `<`, `&`) and the address.
- In the browser, put the embed in a local test page and check:
  - the hidden parts stay hidden;
  - wheel scrolling passes through to the page;
  - credits stay visible at small sizes;
  - the removed-comparison message shows.

## Privacy and terms

- Embeds set no cookies and track nothing. Tiles load from Esri and
  OpenFreeMap in the reader's browser, as on the site.
- Not confirmed: whether Esri's terms limit embedding the satellite view at
  scale. Check their terms before wide or commercial use.

## Decisions for Neela

1. **How much can readers do?** Suggested: pan, zoom and split, as above.
   The alternatives are a static picture that only links out, or the full
   app with its tools.
2. **Should an Explore embed follow later edits,** or always be a snapshot?
3. **Size options:** both Responsive and Fixed, or only one?
4. **Mouse wheel:** Ctrl/⌘ plus scroll to zoom, or no wheel zoom in embeds?
