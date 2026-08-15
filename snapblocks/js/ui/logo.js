/**
 * SnapBlocks brand marks.
 *
 * There is one app mark and it is used everywhere — launcher, store listing,
 * splash, menu header. The old CSS four-tile `logoMark` and the PlayCool
 * Studio crystal emblem are both gone: the studio is credited as plain text on
 * the splash, so a second brand never competes with the game's own.
 */

/**
 * Full SnapBlocks app icon, matching the launcher/store icon in assets/icon.png.
 *
 * Five multi-cell pieces lock into a 4x4 board: a red P-pentomino, a yellow
 * S-shape, a green T, a blue domino and a single purple cell. Cell (row 0,
 * col 1) is split corner to corner between red and yellow — the one diagonal
 * seam, which is what separates this mark from a generic block-puzzle grid.
 *
 * Pieces are drawn as overlapping rounded rects rather than hand-traced
 * outlines; same-fill rects union cleanly wherever they overlap by more than
 * the corner radius, which every pair here does.
 */
export const appLogo = (px = 112) => `
    <svg class="sb-app-logo" width="${px}" height="${px}" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="SnapBlocks">
        <rect width="512" height="512" rx="116" fill="#eddfc5"/>
        <rect x="33" y="33" width="446" height="446" rx="78" fill="#ffffff"/>

        <g fill="#ff5040">
            <rect x="62" y="62" width="190" height="190" rx="20"/>
            <rect x="62" y="62" width="91"  height="289" rx="20"/>
        </g>

        <path d="M154 160 L259 54 L300 54 L300 160 Z" fill="#ffffff"/>

        <g fill="#fac100">
            <path d="M163 151 L252 62 L310 62 L310 151 Z" stroke="#fac100" stroke-width="10" stroke-linejoin="round"/>
            <rect x="260" y="62"  width="91"  height="289" rx="20"/>
            <rect x="260" y="161" width="190" height="91"  rx="20"/>
        </g>

        <rect x="359" y="62" width="91" height="91" rx="20" fill="#9861ff"/>

        <g fill="#00c96c">
            <rect x="62"  y="359" width="289" height="91"  rx="20"/>
            <rect x="161" y="260" width="91"  height="190" rx="20"/>
        </g>

        <rect x="359" y="260" width="91" height="190" rx="20" fill="#2d9bff"/>
    </svg>
`;

// The menu header uses the mask-safe store export. Its artwork already has
// generous internal breathing room, so the coloured mark reads smaller and
// cleaner beside the wordmark than the edge-to-edge inline launch emblem.
export const menuAppLogo = (px = 30) => `
    <img class="sb-app-logo sb-menu-app-logo"
        src="./assets/branding/google-play/snapblocks-play-store-safe-512.png"
        width="${px}" height="${px}" alt="" aria-hidden="true" decoding="async">
`;

export const wordmark = () => `
    <span class="sb-wordmark">Snap<span class="dot">Blocks</span></span>
`;

export const wordmarkBig = () => `
    <span class="sb-wordmark" style="font-size:42px; letter-spacing:-0.03em; line-height:1;">
        Snap<span class="dot">Blocks</span>
    </span>
`;
