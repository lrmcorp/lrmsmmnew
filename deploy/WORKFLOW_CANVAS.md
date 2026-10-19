# Sosmed Generator node workspace

The generator page now uses an original light node workspace inspired by [ComfyUI's visual node interface](https://github.com/Comfy-Org/ComfyUI). It stays inside the existing LRMsmm application at `/#/generator`.

## Nodes and execution

Nine nodes expose the existing inputs and outputs: Brief & Prompt, Konsep Creator, Concept Reviewer, Image Creator, Final Reviewer, Preview & Persetujuan, Referensi Visual, Rencana & Jadwal, and Perusahaan & Akun.

Provider/model/instruction controls live inside each agent node. Real uploaded references have their own node connected to Image Creator. The preview node shows actual generated media, caption, review findings, retry/cancel actions and the existing human draft handoff. Model outputs are inspectable inside their corresponding nodes. Node badges and moving connections reflect real persisted stage status; they do not start agents or fabricate activity.

The execution order remains the existing bounded pipeline: concept → revision → images → final review. Cables describe those actual dependencies. They cannot be rewired, and dragging a node edits its visual position only. This is not a general ComfyUI execution engine, custom-node loader, local GPU runtime or arbitrary graph editor. No ComfyUI source, runtime, Python environment or plugin was installed/copied.

## Interaction

- Drag a node's title to move it. Focus a title with the keyboard and use arrows (Shift for a larger step).
- Drag the dotted background to pan. Use zoom controls, Ctrl+wheel, or +/- while the canvas is focused. `0` or **Fit** fits the whole graph.
- Jump buttons focus a node; **Hasil** focuses the preview. A minimap shows node layout and the visible region.
- Layout positions are saved locally, namespaced per LRMsmm user. No API keys, briefs, images or model outputs are written to local storage. **Reset layout** restores default positions.
- **Simpan preset** saves the existing personal provider/model/instruction preset. **Jalankan tim agen** uses the same cost confirmation and API contracts as before.
- **Tampilan daftar** offers a readable stacked/grid alternative. Phones default to this mode; the canvas remains available. Form fields remain native and support ordinary keyboard focus. Reduced-motion preferences disable decorative animation.
- **Antrean & riwayat campaign** switches the selected existing run; its actual outputs populate the graph and preview.

Date-range planning, private API credentials, reference-conditioned generation, Draft Konten approval, scheduling, permissions and media cleanup use the existing server services. Moving/zooming nodes never schedules a post or calls a paid provider.

## Verification

`test/browser-components.cjs` now also exercises nine nodes/eight links, keyboard and pointer node movement, updating cable geometry, layout persistence across reloads, zoom, pan, reset and list mode. It still covers manual 12-content plans, upload/approval/calendar flow, login, command menu, and 390px/1440px layouts. A separate local browser run exercises real app state with simulated provider responses, image-reference upload, running-node animation/reduced motion, generated previews and private Tulis Post handoff. No paid provider or real Instagram posting is involved.

All canvas source is in `public/workflow-canvas.js` and `public/workflow-canvas.css`; existing inputs are mounted directly into nodes to avoid duplicated form state or duplicate requests.
