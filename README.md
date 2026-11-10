<p align="center">
  <img src="assets/icons/logo-leiame.svg" width="260" alt="LeiaMe">
</p>
<h1 align="center">LeiaMe <sup>V1.2</sup></h1>

<p align="center">Leitor de PDF e EPUB no navegador, com leitura em voz alta local, destaques e modo offline.</p>

<p align="center"><a href="https://paescoelho.github.io/LeiaMe/">Abrir o app</a></p>

---

## O que é

O **LeiaMe** é um fork do [PocketReader](https://github.com/charlesneimog/PocketReader), de Charles Neimog, com identidade visual própria:

- **Paleta "papel e tinta"** — fundo creme quente no modo claro, carvão quente no modo escuro e destaque em verde-petróleo, pensada para leituras longas com menos cansaço visual.
- **Cinzas quentes** no lugar dos tons azulados do Tailwind (slate/gray remapeados em `src/css/input.css`).
- **PDF no modo escuro** com leve tom sépia em vez de cinza puro.
- **Logo animado "Equalizador"**: fones de ouvido com livros que sobem e descem como barras de som.
- **Ícone da floresta** redesenhado no mesmo estilo (árvore com copa de equalizador).
- **Interface 100% em português do Brasil**, incluindo mensagens, jardim de leitura e e-mails do servidor.
- **Voz padrão em português** (pt_BR · Faber).
- O modo AMOLED (preto puro) foi mantido como estava.

Todas as funcionalidades do PocketReader foram preservadas: PDF e EPUB locais, TTS com Piper no próprio dispositivo, destaques, galeria de documentos, PWA instalável e funcionamento offline. A documentação técnica original está em [`docs/README-PocketReader.md`](docs/README-PocketReader.md).

## Rodar localmente

```bash
git clone --recurse-submodules https://github.com/paescoelho/LeiaMe.git
cd LeiaMe
python3 -m http.server 8000
# abra http://localhost:8000
```

## Alterar as cores

As cores do Tailwind ficam em `src/css/input.css` (bloco `@theme`). Depois de editar, gere de novo o CSS:

```bash
npx @tailwindcss/cli@4 -i src/css/input.css -o src/css/output.css
```

As variáveis do leitor (fundos, painéis, botões, realces) ficam no topo de `src/css/style.css`.

## Limitações conhecidas

- **Sincronização com Google Drive**: o ID OAuth em `src/config.js` pertence ao projeto original e só autoriza o domínio dele. Para usar no LeiaMe, crie um ID próprio seguindo [`assets/GOOGLE_DRIVE_SETUP.md`](assets/GOOGLE_DRIVE_SETUP.md).
- **Servidor próprio (TTS/sync)**: continua opcional; veja `server.py`, `Dockerfile` e `compose.yml`.

## Responsável

**Rodrigo Paes Coelho Santana** — [paescoelho@gmail.com](mailto:paescoelho@gmail.com)

## Licença e créditos

LeiaMe V1.2 © 2026 Rodrigo Paes Coelho Santana. Distribuído sob a **GNU GPL v3** (ver [`LICENSE`](LICENSE)), a mesma do projeto original.
Código original © Charles Neimog e colaboradores do PocketReader. Renderização de EPUB via [foliate-js](https://github.com/johnfactotum/foliate-js); PDF via PDF.js; voz via Piper.
