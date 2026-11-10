// Ícone "Floresta" do LeiaMe: uma árvore cuja copa é o equalizador do logo.
// Três barras (como os livros do logo) com marcadores de pico dourados, sobre um tronco.
export function forestIconSvg({ size = 22, className = "" } = {}) {
    return `
<svg class="leiame-forest-icon ${className}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <g class="leiame-forest-icon__bars">
        <rect class="leiame-forest-icon__bar leiame-forest-icon__bar--1" x="4.2" y="8" width="4.6" height="8" rx="2.3"/>
        <rect class="leiame-forest-icon__bar leiame-forest-icon__bar--2" x="9.7" y="3.5" width="4.6" height="12.5" rx="2.3"/>
        <rect class="leiame-forest-icon__bar leiame-forest-icon__bar--3" x="15.2" y="6.5" width="4.6" height="9.5" rx="2.3"/>
    </g>
    <g class="leiame-forest-icon__peaks">
        <rect x="4.6" y="5.6" width="3.8" height="1.4" rx=".7"/>
        <rect x="10.1" y="1.1" width="3.8" height="1.4" rx=".7"/>
        <rect x="15.6" y="4.1" width="3.8" height="1.4" rx=".7"/>
    </g>
    <rect class="leiame-forest-icon__trunk" x="11" y="15" width="2" height="5" rx="1"/>
    <path class="leiame-forest-icon__ground" d="M4.5 20.6 H19.5" stroke-width="1.6" stroke-linecap="round"/>
</svg>`;
}
