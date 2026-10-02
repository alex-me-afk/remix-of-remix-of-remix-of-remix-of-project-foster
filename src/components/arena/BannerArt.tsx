/**
 * One piece of card art, with the missing-file case handled.
 *
 * Banner art lives in `public/banners/` and is referenced by plain URL, NOT by an
 * `@/assets` import like the weapon icons. That is deliberate: a static import of a file
 * that is not on disk yet fails the whole BUILD, and this art arrives one operative and one
 * car at a time. A URL that 404s costs one failed request and falls back to whatever the
 * roster drew before there was art — a coloured chip, or an icon.
 *
 * The trade-off to know about: `@/assets` imports get a content hash in the filename, so
 * they can be cached forever. Files under `public/` are served by name, so replacing a
 * banner needs a normal cache-bust. For art that changes once in a blue moon that is the
 * right side of the trade.
 */

import { useState, type ReactNode } from "react";

type Props = {
  /** `/banners/...`, or undefined for an entity with no art yet */
  src: string | undefined;
  alt: string;
  className: string;
  /** drawn instead of the image when there is no art, or when the file 404s */
  fallback?: ReactNode;
};

export default function BannerArt({ src, alt, className, fallback = null }: Props) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) return <>{fallback}</>;
  return (
    <img
      src={src}
      alt={alt}
      /**
       * The real pixel size of the source. Declaring it lets the browser reserve the box
       * before the bytes land, so a shop grid of ten of these does not reflow as they
       * decode. `lazy` matters more than it looks: the roster renders every tile at once
       * but the player only ever looks at one, and each 600x600 PNG costs 1.44 MB of RAM
       * once decoded — on a 2 GB phone, ten eager decodes is 14 MB for thumbnails.
       */
      width={600}
      height={600}
      loading="lazy"
      decoding="async"
      /* the picker tells the player to drag the preview to turn it — a tile that starts a
         native image drag instead would fight that gesture */
      draggable={false}
      onError={() => setBroken(true)}
      className={className}
    />
  );
}
