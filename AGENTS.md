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

## Project rules
- `supabase/schema.sql` is the single full database schema (all tables, grants, policies); update it in the same change as every migration — it ships with the game so hosts know which SQL to run.
- Player progress lives in the cloud `player_profiles` table; clients write only through the `saveMyProfile` server function (direct client writes are revoked to block cheating). localStorage is just a cache/guest fallback.
- Onboarding: first visit picks name, one free operative (rest locked, saved in owned_characters) and one free dance; older profiles are grandfathered with everything.
- New Mixamo FBX clips are converted with `scripts/fbx-to-anim-glb.ts` (no Blender) into a mesh-less bundle that reuses `operative-anims.glb`'s skeleton; extra bundles are merged into the shared library in `loadOperativeAnims` so every rig gets them.
