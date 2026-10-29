# Murdoku Helper

A phone-first web page that helps you solve Murdoku cases from printed books. It is a single static file, `index.html`, with no build step and no dependencies.

## What it does

1. **Photos.** Upload a photo of the puzzle map and a photo of the clue cards.
2. **Grid.** The page finds the board and overlays a grid. Drag the four corner dots to correct it, and set the number of rows and columns. The board is straightened so tilted photos still give a clean grid.
3. **Clues.** Each suspect gets a card with a letter, name, picture and clue. General rules that belong to no suspect go in their own list. Suspects are sorted by initial.
4. **Solve.** Tap a suspect, then tap squares.
   - Pencil puts temporary marks. Several suspects can share a square.
   - Pen places a suspect for good and crosses out their row and column.
   - The X tool adds and removes crosses, the eraser clears a square, and Undo steps back.
   - Check confirms every row and column holds one suspect.

Progress, photos and the timer are saved in the browser's local storage.

## Running it

Open `index.html` in a browser, or serve the folder with any static host such as Vercel or GitHub Pages. No build command and no output directory are needed; deploy the repository root as is.

## Editing

`page.html` is the source. It is also the file published as a Claude Artifact. After changing it, run `python3 build.py` to regenerate `index.html`, which wraps the source in a full HTML document (doctype, charset, viewport and a small reset) so it works on ordinary hosts.

## Reading clues with Claude

The "Read clues with Claude" button transcribes the clue photo, crops each suspect's picture and picks up general rules.

- **Inside a Claude Artifact** it uses the artifact's built-in Claude access. Nothing to set up.
- **On Vercel or any other host** it calls `/api/read-clues`, a serverless function in `api/read-clues.js`. To turn it on, add an environment variable `ANTHROPIC_API_KEY` in the Vercel project (Settings, Environment Variables) and redeploy. Set `ANTHROPIC_MODEL` to use a different model; the default is `claude-sonnet-5-5`. Each read uses a little of your API credit.
- **Without the key** the page shows a short message and you type the clues in by hand. Everything else works the same.

The key stays on the server and is never sent to the browser. The function only accepts calls from the site's own pages and a fixed prompt, but anyone who can open your site can still trigger reads. Use Vercel's deployment protection or a spending limit on the key if the site is public. The prompt in `api/read-clues.js` mirrors the one in `page.html`; change both together.

## Limits

- The page does not know which room each square belongs to, so room clues and the final murderer are still yours to work out.
- Grid detection assumes a square board. If a photo is misread, adjust the corner dots and the row and column counts.
