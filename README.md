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

## Reading the clue photo

There are three ways to fill in the clue cards. Typing them by hand always works.

**1. Offline reading, no AI.** The "Read clues offline" button runs the Tesseract text reader inside your browser. The photo never leaves your device. It reads text only, so it will not know which words are bold and it cannot crop suspect pictures; add those by hand (`**bold**` markup, and the picture crop tool). It splits the text into cards by looking for a "letter + name" line, and treats wide lines that span the page as general rules. Check each card against the photo.

The first run downloads the reader (about 5 MB) from jsDelivr. To make it work with no network at all, copy `tesseract.min.js`, `worker.min.js`, `tesseract-core*.wasm*` and `lang/eng.traineddata.gz` from the `tesseract.js` and `tesseract.js-core` npm packages into `vendor/tesseract/`; the page uses that folder when it exists.

**2. An AI provider through your own key.** On Vercel or any other host, a serverless function (`api/read-clues.js`) reads the photo with Claude, Gemini or DeepSeek. Add one key in the Vercel project (Settings, Environment Variables) and redeploy:

| Provider | Variable | Model variable | Default model | What it receives |
| --- | --- | --- | --- | --- |
| Claude | `ANTHROPIC_API_KEY` | `ANTHROPIC_MODEL` | `claude-sonnet-5-5` | the photo |
| Gemini | `GEMINI_API_KEY` | `GEMINI_MODEL` | `gemini-3.8-flash` | the photo |
| DeepSeek | `DEEPSEEK_API_KEY` | `DEEPSEEK_MODEL` | `deepseek-flash` | offline OCR text only |

If several keys are set, `CLUE_PROVIDER` (`anthropic`, `gemini` or `deepseek`) chooses; otherwise the first key found in the order above is used. Claude and Gemini also crop the suspect pictures and keep bold words. DeepSeek's current model has no documented image input, so the page reads the photo offline first and sends DeepSeek only the text to tidy up. Model names change often, so set the model variable if a default stops working. Gemini thinks before answering, which is slow for plain text reading, so the function asks for a low thinking level; set `GEMINI_THINKING` to `medium`, `high` or `off` to change that. Requests are cut off after 50 seconds, and the page shows the provider's own error message when a read fails.

**3. Inside a Claude Artifact** the button uses the artifact's built-in Claude access with nothing to set up. Offline reading is not available there.

Keys stay on the server and are never sent to the browser. The function accepts only calls from the site's own pages and uses a fixed prompt, but anyone who can open your site can still trigger reads. Use Vercel's deployment protection or a spending limit on the key if the site is public. The prompts in `api/read-clues.js` mirror the one in `page.html`; change them together.

## Limits

- The page does not know which room each square belongs to, so room clues and the final murderer are still yours to work out.
- Grid detection assumes a square board. If a photo is misread, adjust the corner dots and the row and column counts.
