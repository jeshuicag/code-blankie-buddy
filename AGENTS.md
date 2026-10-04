<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Produce recognition = MobileNet v2 (alpha 0.5) bundled in public/models/mobilenet (inputRange [0,1]) + retrained head in public/models/produce; LABELS order in src/lib/produce.ts must match training labels. Why: small, fully offline from first open.
- The posting experience is a single icon-guided state machine, with the voice sub-sequence reporting completion to the page. Why: only one next action should be visually prompted at a time.
