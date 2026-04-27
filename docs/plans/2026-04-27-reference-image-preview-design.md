# Reference Image Preview Design

## Goal

Allow users to click selected reference images in the composer and view them larger before submitting the next prompt.

## Approved Interaction

- Clicking a reference image card opens a large preview.
- The preview includes all selected reference images as slides, starting from the clicked image.
- Users can switch between reference images and zoom in/out using the existing lightbox behavior.
- The existing remove button remains separate and should not trigger preview.
- Clearing/removing reference images keeps the current behavior.

## Architecture

Reuse the project-wide `yet-another-react-lightbox` + `Zoom` plugin already used by generated-image cards, gallery, and market previews. `ChatComposer` owns the selected reference image list and can derive lightbox slides directly from `selectedReferenceImages`. No hook, persistence, API, or backend changes are required.

## Accessibility

Each preview trigger is a real button with an aria label such as `预览参考图 1`. The close label follows the existing Chinese lightbox labels. The remove button keeps its own aria label and remains independently clickable.

## Testing

Add component tests for `ChatComposer`:

1. Clicking `预览参考图 1` opens the mocked lightbox.
2. The lightbox receives all selected reference images as slides and starts at the clicked index.
3. Clicking `移除参考图 1` still only calls `onRemoveReference` and does not open the lightbox.
