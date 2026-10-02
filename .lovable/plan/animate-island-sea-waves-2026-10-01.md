# Animate island sea waves

## What will change
- Detect the largest authored sea/water mesh when an island level loads.
- Give that mesh a lightweight GPU water effect with small rolling surface waves, moving highlights, depth color, and existing scene fog.
- Advance only a time value each frame, leaving gameplay collision, water level checks, and loot placement unchanged.
- Restore and dispose the water effect cleanly when the match closes.

## Technical details
- Add a focused water helper beside the other arena visual systems.
- Reuse the GLB water geometry and transform; animate vertex positions in the shader rather than changing geometry on the CPU.
- Preserve the detected static waterline for gameplay logic so visible waves do not alter collision rules.
- Keep the shader inexpensive for the current low-end device budget.

## Verification
- Check the preview build logs.
- Open an island map in the browser and confirm the sea is visible, animated between frames, and free of console/runtime errors.
