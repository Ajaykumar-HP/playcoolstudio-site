/**
 * Inline SVG icon factory — port of the `I` object from the design prototype.
 * Strokes use currentColor so parents control color via CSS.
 */

const icons = {
    gear: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3h0a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8v0a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/></svg>`,
    back: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>`,
    menu: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>`,
    close: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>`,
    play: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`,
    pause: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1.5"/><rect x="14" y="4" width="4" height="16" rx="1.5"/></svg>`,
    star: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5l2.9 6.4 7 .7-5.3 4.7 1.6 6.8L12 17.7 5.8 21l1.6-6.8L2.1 9.6l7-.7z"/></svg>`,
    trophy: `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4h10v2h3v3a5 5 0 01-4 4.9 5 5 0 01-3 2V18h3v3H8v-3h3v-2.1a5 5 0 01-3-2A5 5 0 014 9V6h3zM6 8v1a3 3 0 001 2.2V8zm12 0v3.2A3 3 0 0019 9V8z"/></svg>`,
    // Matched premium help family: Hint carries an exclamation mark, while
    // Solve uses the same bulb silhouette with a check. Both interior glyphs
    // stay bold enough to read at the HUD's compact mobile size.
    //
    // Duotone via currentColor + fill-opacity, NOT literal hex. The authored
    // version pinned #FFD52A/#5A3900 here and #39E2A2/#07513D on solve, which
    // put a green bulb on the lilac Solve pill and froze both icons against the
    // four themes. Opacity (not `opacity=`) is set with fill-opacity/
    // stroke-opacity so the arrive/tap keyframes can still animate `opacity`
    // on top without fighting a baked-in attribute.
    bulb: `<svg class="sb-premium-icon sb-premium-hint-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle class="sb-help-halo" cx="12" cy="10.4" r="9.1" fill="currentColor" fill-opacity=".16"/>
        <g class="sb-help-rays" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-opacity=".85">
            <path d="M12 1.1V.25"/><path d="m5.3 3.7-.75-.78"/><path d="m18.7 3.7.75-.78"/>
            <path d="M2.7 10.1H1.6"/><path d="M22.4 10.1h-1.1"/>
        </g>
        <g class="sb-help-bulb-group">
            <path class="sb-help-glass" d="M12 3.15a6.65 6.65 0 0 0-4.08 11.9 3.15 3.15 0 0 1 1.3 2.53v.32h5.56v-.32c0-1 .48-1.94 1.3-2.53A6.65 6.65 0 0 0 12 3.15Z" fill="currentColor" fill-opacity=".26"/>
            <path class="sb-help-glass-shine" d="M8.25 9.2a4.35 4.35 0 0 1 3.2-4.18" stroke="#fff" stroke-width="1.15" stroke-linecap="round" stroke-opacity=".55"/>
            <path class="sb-help-outline" d="M12 3.15a6.65 6.65 0 0 0-4.08 11.9 3.15 3.15 0 0 1 1.3 2.53v.32h5.56v-.32c0-1 .48-1.94 1.3-2.53A6.65 6.65 0 0 0 12 3.15Z" stroke="currentColor" stroke-width="1.55" stroke-linejoin="round"/>
            <g class="sb-hint-symbol" fill="currentColor">
                <rect x="11.05" y="7" width="1.9" height="5.45" rx=".95"/>
                <circle cx="12" cy="14.3" r="1.02"/>
            </g>
            <rect class="sb-help-base" x="8.6" y="17.15" width="6.8" height="3.25" rx="1.1" fill="currentColor" fill-opacity=".85"/>
            <path class="sb-help-base" d="M10.2 20.15h3.6v.55a1.8 1.8 0 0 1-3.6 0z" fill="currentColor" fill-opacity=".62"/>
        </g>
    </svg>`,
    undo: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 00-15-6.7L3 13"/></svg>`,
    redo: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0115-6.7L21 13"/></svg>`,
    refresh: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 019-9 9 9 0 016.4 2.6L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 01-9 9 9 9 0 01-6.4-2.6L3 16"/><path d="M3 21v-5h5"/></svg>`,
    flame: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2s4 4 4 8a4 4 0 01-8 0c0-1 .5-2 1-3-2 1-4 3-4 6a7 7 0 0014 0c0-6-7-11-7-11z"/></svg>`,
    gem: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 3h12l4 6-10 12L2 9zm2.5 2L6 9h4zm7 0L14 9h4zM10 9h4l-2 8z"/></svg>`,
    clock: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
    lock: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a5 5 0 00-5 5v3H6a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2v-8a2 2 0 00-2-2h-1V7a5 5 0 00-5-5zm-3 8V7a3 3 0 016 0v3z"/></svg>`,
    check: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    share: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg>`,
    chevronR: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg>`,
    sparkle: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5z"/></svg>`,
    heart: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7-4.5-9.3-9A5.3 5.3 0 017.6 5.2 5 5 0 0112 7.5a5 5 0 014.4-2.3 5.3 5.3 0 014.9 6.8C19 16.5 12 21 12 21z"/></svg>`,
    calendar: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`,
    map: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2 3 4v18l6-2 6 2 6-2V2l-6 2z"/><path d="M9 2v18M15 4v18"/></svg>`,
    music: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M9 18V5l12-2v13a4 4 0 11-2-3.5V6.5L11 8v10a4 4 0 11-2-3.5z"/></svg>`,
    volume: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3z"/><path d="M16 8a5 5 0 010 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
    mute: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9v6h4l5 5V4L7 9H3z" fill="currentColor" stroke="none"/><path d="M18 9l4 4M22 9l-4 4"/></svg>`,
    musicOff: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><path d="M11 8l8-1.5"/><circle cx="7" cy="18" r="3"/><path d="M3 3l18 18"/></svg>`,
    vibrate: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="4" width="8" height="16" rx="1"/><path d="M4 9v6M20 9v6"/></svg>`,
    info: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h0"/></svg>`,
    eye: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>`,
    coin: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="9" opacity="0.95"/><circle cx="12" cy="12" r="6.2" fill="none" stroke="rgba(0,0,0,0.18)" stroke-width="1.4"/><path d="M12 7.5l1.3 2.9 3.2.3-2.4 2.1.7 3.1L12 14.4 9.2 16l.7-3.1-2.4-2.1 3.2-.3z" fill="rgba(255,255,255,0.65)"/></svg>`,

    // Premium semantic assets. Duotone facets use currentColor at different
    // opacities so every icon inherits its screen's theme/accent cleanly.
    // A restored place rather than a generic globe: the framed landscape
    // mirrors the World screen's faded-scene -> colour-bloom progression.
    world: `<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="2.75" y="4" width="18.5" height="16" rx="4" fill="currentColor" opacity=".14"/>
        <circle cx="16.8" cy="8.2" r="2.15" fill="currentColor" opacity=".58" stroke="none"/>
        <path d="m4.4 17.6 4.7-5.7 3.15 3.25 2.35-2.5 5 4.95" fill="currentColor" opacity=".22"/>
        <path d="m4.4 17.6 4.7-5.7 3.15 3.25 2.35-2.5 5 4.95"/>
        <path d="M7.05 5.55 7.5 7l1.45.45-1.45.45-.45 1.45L6.6 7.9l-1.45-.45L6.6 7z" fill="currentColor" stroke="none"/>
        <rect x="2.75" y="4" width="18.5" height="16" rx="4"/>
    </svg>`,
    journey: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 18c2.2-5.5 5.2-1 8-6s4.5-3.2 6-7"/><circle cx="5" cy="18" r="2.5" fill="currentColor" opacity=".25"/><path d="M19 3.5c-1.8 0-3.2 1.4-3.2 3.2 0 2.4 3.2 5.3 3.2 5.3s3.2-2.9 3.2-5.3c0-1.8-1.4-3.2-3.2-3.2z" fill="currentColor" opacity=".2"/><circle cx="19" cy="6.7" r="1" fill="currentColor" stroke="none"/></svg>`,
    levelComplete: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4h8v2h3v2a4 4 0 01-4 4h-.4A5 5 0 0113 14.9V17h3v3H8v-3h3v-2.1A5 5 0 019.4 12H9a4 4 0 01-4-4V6h3V4z" fill="currentColor" opacity=".22"/><path d="M8 4h8v4a4 4 0 01-8 0V4zM8 6H5v2a4 4 0 004 4M16 6h3v2a4 4 0 01-4 4M12 12v5M9 20h6"/><path d="m12 6 .7 1.4 1.5.2-1.1 1 .3 1.5-1.4-.8-1.4.8.3-1.5-1.1-1 1.5-.2z" fill="currentColor" stroke="none"/></svg>`,
    treasureChest: `<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M3 10h18v9a2 2 0 01-2 2H5a2 2 0 01-2-2v-9z" fill="currentColor" opacity=".2"/><path d="M4 10V8a5 5 0 015-5h6a5 5 0 015 5v2M3 10h18v9a2 2 0 01-2 2H5a2 2 0 01-2-2v-9zM3 13h18"/><rect x="10" y="11" width="4" height="5" rx="1" fill="currentColor" stroke="none"/></svg>`,
    prismMix: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="m12 2 7 7-7 13L5 9l7-7z" fill="currentColor" opacity=".15"/><path d="m12 2 7 7-7 13L5 9l7-7zM5 9h14M12 2v20M8.5 9 12 22 15.5 9"/><path d="m12 2 3.5 7H8.5L12 2z" fill="currentColor" opacity=".34"/></svg>`,
    powerPulse: `<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" opacity=".34"/><circle cx="12" cy="12" r="6" opacity=".22"/><path d="m13.4 3.5-6 9h4.2l-1 8 6-9h-4.2l1-8z" fill="currentColor" opacity=".28"/><path d="m13.4 3.5-6 9h4.2l-1 8 6-9h-4.2l1-8z"/></svg>`,
    // Solve deliberately reuses the Hint silhouette, differentiated by a mint
    // material and a strong checkmark inside the glass.
    wand: `<svg class="sb-premium-icon sb-premium-solve-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle class="sb-help-halo" cx="12" cy="10.4" r="9.1" fill="currentColor" fill-opacity=".16"/>
        <g class="sb-help-rays" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-opacity=".85">
            <path d="M12 1.1V.25"/><path d="m5.3 3.7-.75-.78"/><path d="m18.7 3.7.75-.78"/>
            <path d="M2.7 10.1H1.6"/><path d="M22.4 10.1h-1.1"/>
        </g>
        <g class="sb-help-bulb-group">
            <path class="sb-help-glass" d="M12 3.15a6.65 6.65 0 0 0-4.08 11.9 3.15 3.15 0 0 1 1.3 2.53v.32h5.56v-.32c0-1 .48-1.94 1.3-2.53A6.65 6.65 0 0 0 12 3.15Z" fill="currentColor" fill-opacity=".26"/>
            <path class="sb-help-glass-shine" d="M8.25 9.2a4.35 4.35 0 0 1 3.2-4.18" stroke="#fff" stroke-width="1.15" stroke-linecap="round" stroke-opacity=".55"/>
            <path class="sb-help-outline" d="M12 3.15a6.65 6.65 0 0 0-4.08 11.9 3.15 3.15 0 0 1 1.3 2.53v.32h5.56v-.32c0-1 .48-1.94 1.3-2.53A6.65 6.65 0 0 0 12 3.15Z" stroke="currentColor" stroke-width="1.55" stroke-linejoin="round"/>
            <path class="sb-solve-symbol" d="m8.75 10.9 2.18 2.2 4.38-4.55" stroke="currentColor" stroke-width="2.15" stroke-linecap="round" stroke-linejoin="round"/>
            <rect class="sb-help-base" x="8.6" y="17.15" width="6.8" height="3.25" rx="1.1" fill="currentColor" fill-opacity=".85"/>
            <path class="sb-help-base" d="M10.2 20.15h3.6v.55a1.8 1.8 0 0 1-3.6 0z" fill="currentColor" fill-opacity=".62"/>
        </g>
    </svg>`,
    palette: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M12 3a9 9 0 100 18h1.3a1.8 1.8 0 001.2-3.1 1.8 1.8 0 011.2-3.1H18A3 3 0 0021 12a9 9 0 00-9-9z" fill="currentColor" opacity=".16"/><circle cx="7.5" cy="10" r="1" fill="currentColor"/><circle cx="10" cy="6.7" r="1" fill="currentColor"/><circle cx="14.4" cy="7" r="1" fill="currentColor"/><circle cx="17" cy="10.5" r="1" fill="currentColor"/></svg>`,
    crown: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="m3 7 5 4 4-7 4 7 5-4-2 11H5L3 7z" fill="currentColor" opacity=".2"/><path d="m3 7 5 4 4-7 4 7 5-4-2 11H5L3 7zM5 18h14v2H5z"/></svg>`,
    focus: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="8" opacity=".25"/><circle cx="12" cy="12" r="3" fill="currentColor" opacity=".25"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>`,
    shieldCheck: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 4.5 5v6c0 5 3 8.7 7.5 11 4.5-2.3 7.5-6 7.5-11V5L12 2z" fill="currentColor" opacity=".17"/><path d="M12 2 4.5 5v6c0 5 3 8.7 7.5 11 4.5-2.3 7.5-6 7.5-11V5L12 2zM8.5 12l2.2 2.2 4.8-5"/></svg>`,
    rocket: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4c2.2-1.5 4.5-1.8 6.5-1.5.3 2-.1 4.3-1.5 6.5l-6.5 6.5-4-4L14 4z" fill="currentColor" opacity=".18"/><path d="M14 4c2.2-1.5 4.5-1.8 6.5-1.5.3 2-.1 4.3-1.5 6.5l-6.5 6.5-4-4L14 4zM8.5 11.5 5 12l-2 4 5-.5M12.5 15.5 12 19l-4 2 .5-5M5 19l-2 2M16 7h.01"/></svg>`,
    restore: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21v-8M12 15c-4.5 0-7-2.5-7-7 4.5 0 7 2.5 7 7zM12 12c0-4 2.4-6.4 7-6.4 0 4.2-2.4 6.4-7 6.4z" fill="currentColor" opacity=".16"/><path d="M12 21v-8M12 15c-4.5 0-7-2.5-7-7 4.5 0 7 2.5 7 7zM12 12c0-4 2.4-6.4 7-6.4 0 4.2-2.4 6.4-7 6.4z"/></svg>`,
    // Lab prototype surface (see the LAB block in screens.js / screens.css).
    flask: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3.5v6.1l-4.6 8A2 2 0 007.1 20.5h9.8a2 2 0 001.7-2.9L14 9.6V3.5z" fill="currentColor" opacity=".18"/><path d="M9 3.5h6M10 3.5v6.1l-4.6 8A2 2 0 007.1 20.5h9.8a2 2 0 001.7-2.9L14 9.6V3.5M7.4 15h9.2"/><circle cx="10.4" cy="17.4" r=".95" fill="currentColor" stroke="none"/><circle cx="13.9" cy="18.1" r=".7" fill="currentColor" stroke="none"/></svg>`,
};

export default icons;
