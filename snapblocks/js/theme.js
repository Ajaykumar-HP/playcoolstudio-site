/**
 * Theme System — canvas-side mirror of css/tokens.css
 *
 * Two themes: `cream` (default light) and `midnight` (warm dark).
 * Values are hex/rgba approximations of the OKLCH palette in css/tokens.css
 * so ctx.fillStyle works on WebView versions that don't yet support oklch()
 * inside canvas contexts.
 *
 * When the CSS tokens change, update the matching entries here.
 */

const makeTheme = (theme) => ({
    ...theme,
    highlight: theme.pieceHighlight,
});

const THEMES = {
    // =========================================================
    // CREAM (default light) — warm & playful candy
    // Source of truth: css/tokens.css :root block
    // =========================================================
    cream: makeTheme({
        name: 'Cream',

        // surfaces
        bg1: '#faf6ef',              // --bg
        bg2: 'rgba(242,236,227,0.92)', // --bg-2
        bg3: 'rgba(235,227,214,0.55)', // --bg-inset
        ink: '#2a2035',              // --ink
        ink2: '#5a4d66',             // --ink-2
        inkSoft: '#8a8194',          // --ink-soft
        line: '#ddd6ca',             // --line
        lineStrong: '#ccc2b1',       // --line-strong

        // candy accents
        coral: '#ec8b6c',
        butter: '#f3d978',
        mint: '#8fd8b4',
        sky: '#89b8d6',
        lilac: '#b599cc',
        rose: '#e9a4b3',

        // primary CTA
        primary: '#d96a4e',
        primaryInk: '#fffaf4',
        primaryShade: '#b95534',

        // -------- Canvas-module aliases (existing keys) --------
        boardOuter: '#fffefa',
        boardOuterTop: '#fffefa',
        boardOuterBottom: '#fffefa',
        boardInner: '#fffefa',
        // Warm page → clean white board card → neutral grey cell wells.
        boardFill: '#fffefa',
        boardFillTop: '#fffefa',
        boardFillBottom: '#fffefa',
        boardCellFill: '#f2f1f0',
        boardCellEdge: 'rgba(92,82,72,0.035)',
        boardInsetShadow: 'rgba(82,60,38,0.18)',
        boardInnerGlow: 'rgba(255,252,246,0.58)',
        boardEdge: 'rgba(95,72,48,0.055)',
        boardLift: 'rgba(255,255,255,0.22)',
        boardSheen: 'rgba(255,255,255,0.20)',
        boardDot: 'rgba(67,55,76,0.20)',
        boardGrid: 'rgba(91,76,103,0.075)',
        boardShadow: 'rgba(64,44,25,0.14)',
        boardAura: 'rgba(255,244,226,0.72)',
        menuHandle: '#f2ece3',
        menuHandleActive: '#ebe3d6',
        menuBody: '#faf6ef',
        btnFill: '#f2ece3',
        btnPressed: '#e8dfd0',
        titleAccent: '#d96a4e',
        titleText: '#2a2035',
        levelText: '#5a4d66',
        progressBg: '#ebe3d6',
        progressFill: '#d96a4e',
        arrowColor: '#5a4d66',
        hintActive: '#f3d978',
        hintInactive: '#ebe3d6',
        victoryColor: '#8fd8b4',
        subText: '#8a8194',
        settingsBg: 'rgba(42,32,53,0.40)',
        settingsPanel: '#faf6ef',
        settingsText: '#2a2035',
        settingsAccent: '#d96a4e',
        toggleOn: '#8fd8b4',
        toggleOff: '#ccc2b1',
        toggleKnob: '#fffaf4',
        divider: 'rgba(138,129,148,0.22)',
        elevation1: { blur: 10, offsetY: 4,  color: 'rgba(42,32,53,0.08)' },
        elevation2: { blur: 18, offsetY: 8,  color: 'rgba(42,32,53,0.14)' },
        elevation3: { blur: 26, offsetY: 14, color: 'rgba(42,32,53,0.20)' },
        glow: 'rgba(217,106,78,0.28)',
        successGlow: 'rgba(143,216,180,0.36)',
        failGlow: 'rgba(217,106,78,0.26)',
        pieceHighlight: '#ec8b6c',
        gridPulse: 'rgba(217,106,78,0.14)',
        hintTargetFill: 'rgba(255,210,91,0.24)',
        hintTargetGlow: 'rgba(240,180,55,0.54)',
        hintGhostFacet: 'rgba(255,210,91,0.28)',
        hintSourceRing: 'rgba(255,113,88,0.30)',
        hintSourceGlow: 'rgba(255,113,88,0.48)',
        hintChipBg: 'rgba(42,32,53,0.78)',
        hintChipText: '#fffaf4',
        // Focus scrim behind an active hint. Canvas-only (no CSS counterpart —
        // no hint* token is mirrored in tokens.css). Alpha is baked in and used
        // straight, NOT wrapped in a second withAlpha: the old code multiplied
        // 0.72 by 0.08 and dimmed nothing.
        hintScrim: 'rgba(24,17,32,0.50)',
        // Hint call-out pair: "this is wrong" / "this is right". MUST stay
        // 6-digit hex — drawFocusBox derives translucent variants from these.
        // The semantics (red = no, green = yes) have to survive every theme for
        // the same reason board.js hardcodes BLOCKED_COLOR.
        hintWrong: '#ff5f49',
        hintRight: '#48c982',
        trayFill: '#eee7dc',
        trayLip: '#eee7dc',
        trayShade: '#eee7dc',
        trayStroke: 'rgba(118,89,58,0.045)',
        trayShadow: 'rgba(58,38,20,0.10)',
        trayDash: 'rgba(255,255,255,0.96)',
        pieceShadow: 'rgba(42,28,22,0.34)',
        trayInner: 'rgba(255,255,255,0.42)',
        trayWell: 'rgba(198,178,147,0.18)',
        trayWellTop: 'rgba(255,250,242,0.30)',
        trayWellBottom: 'rgba(180,160,130,0.16)',
        trayWellStroke: 'rgba(112,82,50,0.10)',
        traySpecular: 'rgba(255,255,255,0.38)',
    }),

    // =========================================================
    // MIDNIGHT (warm dark) — plum base with candy accents
    // =========================================================
    midnight: makeTheme({
        name: 'Midnight',

        // surfaces
        bg1: '#251f34',
        bg2: 'rgba(46,40,62,0.92)',
        bg3: 'rgba(28,23,40,0.7)',
        ink: '#f6f1e9',
        ink2: '#d3cabc',
        inkSoft: '#9f948a',
        line: '#453c5a',
        lineStrong: '#564b6b',

        // candy accents (slightly muted for dark bg)
        coral: '#e88a6c',
        butter: '#edc665',
        mint: '#84cfa7',
        sky: '#84b0cf',
        lilac: '#b095c4',
        rose: '#dd94a4',

        // primary CTA
        primary: '#e2745a',
        primaryInk: '#1e1829',
        primaryShade: '#ad4e33',

        // -------- Canvas-module aliases --------
        boardOuter: '#3a314d',
        boardOuterTop: '#514462',
        boardOuterBottom: '#171321',
        boardInner: '#181322',
        boardFill: '#2a2440',
        boardFillTop: '#342c4c',
        boardFillBottom: '#221c34',
        boardCellFill: '#1b1628',
        boardCellEdge: 'rgba(255,255,255,0.05)',
        boardInsetShadow: 'rgba(0,0,0,0.34)',
        boardInnerGlow: 'rgba(255,250,244,0.075)',
        boardEdge: 'rgba(224,213,236,0.10)',
        boardLift: 'rgba(255,255,255,0.06)',
        boardSheen: 'rgba(255,255,255,0.04)',
        boardDot: 'rgba(224,213,236,0.20)',
        boardGrid: 'rgba(224,213,236,0.06)',
        boardShadow: 'rgba(0,0,0,0.56)',
        boardAura: 'rgba(132,176,207,0.14)',
        menuHandle: '#1f1a2b',
        menuHandleActive: '#453c5a',
        menuBody: '#251f34',
        btnFill: '#2e283e',
        btnPressed: '#1c1728',
        titleAccent: '#e2745a',
        titleText: '#f6f1e9',
        levelText: '#d3cabc',
        progressBg: '#1c1728',
        progressFill: '#e2745a',
        arrowColor: '#d3cabc',
        hintActive: '#edc665',
        hintInactive: '#231d31',
        victoryColor: '#84cfa7',
        subText: '#9f948a',
        settingsBg: 'rgba(10,7,16,0.72)',
        settingsPanel: '#251f34',
        settingsText: '#f6f1e9',
        settingsAccent: '#e2745a',
        toggleOn: '#84cfa7',
        toggleOff: '#564b6b',
        toggleKnob: '#fffaf4',
        divider: 'rgba(214,205,225,0.16)',
        elevation1: { blur: 10, offsetY: 4,  color: 'rgba(0,0,0,0.28)' },
        elevation2: { blur: 18, offsetY: 8,  color: 'rgba(0,0,0,0.40)' },
        elevation3: { blur: 26, offsetY: 14, color: 'rgba(0,0,0,0.52)' },
        glow: 'rgba(226,116,90,0.34)',
        successGlow: 'rgba(132,207,167,0.38)',
        failGlow: 'rgba(226,116,90,0.30)',
        pieceHighlight: '#e88a6c',
        gridPulse: 'rgba(226,116,90,0.20)',
        hintTargetFill: 'rgba(237,198,101,0.20)',
        hintTargetGlow: 'rgba(237,198,101,0.54)',
        hintGhostFacet: 'rgba(237,198,101,0.24)',
        hintSourceRing: 'rgba(232,138,108,0.26)',
        hintSourceGlow: 'rgba(232,138,108,0.48)',
        hintChipBg: 'rgba(12,8,18,0.82)',
        hintChipText: '#fffaf4',
        // Midnight's surfaces are already dark, so the same 0.50 black separates
        // lit from unlit far less than it does on Cream. Pushed up so the one
        // highlighted piece still wins.
        hintScrim: 'rgba(4,2,10,0.58)',
        // Lifted against the dark surface and the heavier 0.58 scrim.
        hintWrong: '#ff7a66',
        hintRight: '#5fd99a',
        trayFill: 'rgba(48,42,65,0.88)',
        trayLip: 'rgba(82,72,105,0.82)',
        trayShade: 'rgba(20,17,30,0.84)',
        trayStroke: 'rgba(214,205,225,0.14)',
        trayShadow: 'rgba(0,0,0,0.54)',
        trayDash: 'rgba(255,255,255,0.42)',
        pieceShadow: 'rgba(0,0,0,0.65)',
        trayInner: 'rgba(255,255,255,0.08)',
        trayWell: 'rgba(0,0,0,0.16)',
        trayWellTop: 'rgba(255,255,255,0.045)',
        trayWellBottom: 'rgba(0,0,0,0.18)',
        trayWellStroke: 'rgba(255,255,255,0.055)',
        traySpecular: 'rgba(255,255,255,0.105)',
    }),

    meadow: makeTheme({
        name: 'Meadow',

        // surfaces
        bg1: '#f0f7f3',
        bg2: 'rgba(226,237,230,0.92)',
        bg3: 'rgba(212,227,217,0.55)',
        ink: '#1d2f23',
        ink2: '#3c5645',
        inkSoft: '#5e7c68',
        line: '#ccdcd1',
        lineStrong: '#b5cbbd',

        // candy accents
        coral: '#ec8b6c',
        butter: '#f3d978',
        mint: '#8fd8b4',
        sky: '#89b8d6',
        lilac: '#b599cc',
        rose: '#e9a4b3',

        // primary CTA
        primary: '#3f9d5a',
        primaryInk: '#fffaf4',
        primaryShade: '#2e7c45',

        // -------- Canvas-module aliases --------
        boardOuter: '#e2ede6',
        boardOuterTop: '#f0f7f3',
        boardOuterBottom: '#c5dbcd',
        boardInner: '#bcd4c5',
        boardFill: '#f4faf6',
        boardFillTop: '#fbfdfb',
        boardFillBottom: '#e6f1ea',
        boardCellFill: '#dcebe1',
        boardCellEdge: 'rgba(40,80,58,0.09)',
        boardInsetShadow: 'rgba(20,35,25,0.18)',
        boardInnerGlow: 'rgba(255,255,255,0.48)',
        boardEdge: 'rgba(29,47,35,0.14)',
        boardLift: 'rgba(255,255,255,0.22)',
        boardSheen: 'rgba(255,255,255,0.20)',
        boardDot: 'rgba(29,47,35,0.18)',
        boardGrid: 'rgba(29,47,35,0.08)',
        boardShadow: 'rgba(20,35,25,0.22)',
        boardAura: 'rgba(143,216,180,0.14)',
        menuHandle: '#e2ede6',
        menuHandleActive: '#ccdcd1',
        menuBody: '#f0f7f3',
        btnFill: '#e2ede6',
        btnPressed: '#ccdcd1',
        titleAccent: '#3f9d5a',
        titleText: '#1d2f23',
        levelText: '#3c5645',
        progressBg: '#ccdcd1',
        progressFill: '#3f9d5a',
        arrowColor: '#3c5645',
        hintActive: '#f3d978',
        hintInactive: '#ccdcd1',
        victoryColor: '#8fd8b4',
        subText: '#5e7c68',
        settingsBg: 'rgba(29,47,35,0.40)',
        settingsPanel: '#f0f7f3',
        settingsText: '#1d2f23',
        settingsAccent: '#3f9d5a',
        toggleOn: '#8fd8b4',
        toggleOff: '#b5cbbd',
        toggleKnob: '#fffaf4',
        divider: 'rgba(94,124,104,0.22)',
        elevation1: { blur: 10, offsetY: 4,  color: 'rgba(29,47,35,0.08)' },
        elevation2: { blur: 18, offsetY: 8,  color: 'rgba(29,47,35,0.14)' },
        elevation3: { blur: 26, offsetY: 14, color: 'rgba(29,47,35,0.20)' },
        glow: 'rgba(63,157,90,0.28)',
        successGlow: 'rgba(143,216,180,0.36)',
        failGlow: 'rgba(63,157,90,0.26)',
        pieceHighlight: '#8fd8b4',
        gridPulse: 'rgba(63,157,90,0.14)',
        hintTargetFill: 'rgba(255,210,91,0.24)',
        hintTargetGlow: 'rgba(240,180,55,0.54)',
        hintGhostFacet: 'rgba(255,210,91,0.28)',
        hintSourceRing: 'rgba(63,157,90,0.30)',
        hintSourceGlow: 'rgba(63,157,90,0.48)',
        hintChipBg: 'rgba(29,47,35,0.78)',
        hintChipText: '#fffaf4',
        hintScrim: 'rgba(10,26,17,0.50)',
        // Meadow's own surfaces are green, so "right" leans cyan to separate
        // from the board rather than blending into it.
        hintWrong: '#ff6247',
        hintRight: '#4fdba0',
        trayFill: 'rgba(240,247,243,0.88)',
        trayLip: 'rgba(255,255,255,0.90)',
        trayShade: 'rgba(188,212,197,0.70)',
        trayStroke: 'rgba(29,47,35,0.14)',
        trayShadow: 'rgba(20,35,25,0.22)',
        trayDash: 'rgba(255,255,255,0.78)',
        pieceShadow: 'rgba(15,28,20,0.34)',
        trayInner: 'rgba(255,255,255,0.42)',
        trayWell: 'rgba(188,212,197,0.18)',
        trayWellTop: 'rgba(255,255,255,0.30)',
        trayWellBottom: 'rgba(188,212,197,0.16)',
        trayWellStroke: 'rgba(29,47,35,0.10)',
        traySpecular: 'rgba(255,255,255,0.38)',
    }),

    sunset: makeTheme({
        name: 'Sunset',

        // surfaces
        bg1: '#faf3f0',
        bg2: 'rgba(245,230,222,0.92)',
        bg3: 'rgba(235,216,206,0.55)',
        ink: '#351f15',
        ink2: '#614235',
        inkSoft: '#8b6c5e',
        line: '#ebd0c4',
        lineStrong: '#e0bcad',

        // candy accents
        coral: '#ec8b6c',
        butter: '#f3d978',
        mint: '#8fd8b4',
        sky: '#89b8d6',
        lilac: '#b599cc',
        rose: '#e9a4b3',

        // primary CTA
        primary: '#e2604f',
        primaryInk: '#fffaf4',
        primaryShade: '#b84435',

        // -------- Canvas-module aliases --------
        boardOuter: '#f5e6de',
        boardOuterTop: '#faf3f0',
        boardOuterBottom: '#e5cbbf',
        boardInner: '#dbbeaf',
        boardFill: '#fef7f2',
        boardFillTop: '#fffcfa',
        boardFillBottom: '#f8e9de',
        boardCellFill: '#f2ded0',
        boardCellEdge: 'rgba(120,70,45,0.09)',
        boardInsetShadow: 'rgba(53,31,21,0.18)',
        boardInnerGlow: 'rgba(255,255,255,0.48)',
        boardEdge: 'rgba(53,31,21,0.14)',
        boardLift: 'rgba(255,255,255,0.22)',
        boardSheen: 'rgba(255,255,255,0.20)',
        boardDot: 'rgba(53,31,21,0.18)',
        boardGrid: 'rgba(53,31,21,0.08)',
        boardShadow: 'rgba(45,25,15,0.22)',
        boardAura: 'rgba(226,96,79,0.14)',
        menuHandle: '#f5e6de',
        menuHandleActive: '#ebd0c4',
        menuBody: '#faf3f0',
        btnFill: '#f5e6de',
        btnPressed: '#ebd0c4',
        titleAccent: '#e2604f',
        titleText: '#351f15',
        levelText: '#614235',
        progressBg: '#ebd0c4',
        progressFill: '#e2604f',
        arrowColor: '#614235',
        hintActive: '#f3d978',
        hintInactive: '#ebd0c4',
        victoryColor: '#8fd8b4',
        subText: '#8b6c5e',
        settingsBg: 'rgba(53,31,21,0.40)',
        settingsPanel: '#faf3f0',
        settingsText: '#351f15',
        settingsAccent: '#e2604f',
        toggleOn: '#8fd8b4',
        toggleOff: '#e0bcad',
        toggleKnob: '#fffaf4',
        divider: 'rgba(139,108,94,0.22)',
        elevation1: { blur: 10, offsetY: 4,  color: 'rgba(53,31,21,0.08)' },
        elevation2: { blur: 18, offsetY: 8,  color: 'rgba(53,31,21,0.14)' },
        elevation3: { blur: 26, offsetY: 14, color: 'rgba(53,31,21,0.20)' },
        glow: 'rgba(226,96,79,0.28)',
        successGlow: 'rgba(143,216,180,0.36)',
        failGlow: 'rgba(226,96,79,0.26)',
        pieceHighlight: '#ec8b6c',
        gridPulse: 'rgba(226,96,79,0.14)',
        hintTargetFill: 'rgba(255,210,91,0.24)',
        hintTargetGlow: 'rgba(240,180,55,0.54)',
        hintGhostFacet: 'rgba(255,210,91,0.28)',
        hintSourceRing: 'rgba(226,96,79,0.30)',
        hintSourceGlow: 'rgba(226,96,79,0.48)',
        hintChipBg: 'rgba(53,31,21,0.78)',
        hintChipText: '#fffaf4',
        hintScrim: 'rgba(32,13,9,0.50)',
        // Sunset's background is already warm; "wrong" stays clear of it.
        hintWrong: '#ff6b52',
        hintRight: '#4ad08a',
        trayFill: 'rgba(250,243,240,0.88)',
        trayLip: 'rgba(255,255,255,0.90)',
        trayShade: 'rgba(235,216,206,0.70)',
        trayStroke: 'rgba(53,31,21,0.14)',
        trayShadow: 'rgba(45,25,15,0.22)',
        trayDash: 'rgba(255,255,255,0.82)',
        pieceShadow: 'rgba(30,15,10,0.34)',
        trayInner: 'rgba(255,255,255,0.42)',
        trayWell: 'rgba(235,216,206,0.18)',
        trayWellTop: 'rgba(255,255,255,0.30)',
        trayWellBottom: 'rgba(235,216,206,0.16)',
        trayWellStroke: 'rgba(53,31,21,0.10)',
        traySpecular: 'rgba(255,255,255,0.38)',
    }),
};

const THEME_KEYS = Object.keys(THEMES);
let currentTheme = 'cream';

// Migration map for legacy theme names still in localStorage
const LEGACY_MAP = {
    dark: 'midnight',
    midnight: 'midnight',
    forest: 'meadow',
    sunset: 'sunset',
    cream: 'cream',
    meadow: 'meadow',
};

const normalize = (key) => LEGACY_MAP[key] || 'cream';

const applyHtmlDataTheme = () => {
    if (typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.setAttribute('data-theme', currentTheme);
    }
};

const Theme = {
    get() { return THEMES[currentTheme]; },
    getKey() { return currentTheme; },
    getName() { return THEMES[currentTheme].name; },
    getAllKeys() { return THEME_KEYS; },
    getAllNames() { return THEME_KEYS.map(k => THEMES[k].name); },

    set(key) {
        const resolved = normalize(key);
        if (THEMES[resolved]) {
            currentTheme = resolved;
            applyHtmlDataTheme();
        }
    },

    cycle() {
        const idx = THEME_KEYS.indexOf(currentTheme);
        currentTheme = THEME_KEYS[(idx + 1) % THEME_KEYS.length];
        applyHtmlDataTheme();
        return currentTheme;
    },
};

export default Theme;
