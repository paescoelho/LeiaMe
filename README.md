<p align="center">
  <img src="assets/icons/logo-leiame.svg" width="260" alt="LeiaMe">
</p>
<h1 align="center">LeiaMe <sup>V1.2</sup></h1>

<p align="center">Leitor de PDF e EPUB no navegador, com leitura em voz alta, destaques, exportação em MP3 e modo offline.</p>

<p align="center"><a href="https://paescoelho.github.io/LeiaMe/">Abrir o app</a></p>

---

## Recursos

- **PDF e EPUB** abertos direto no aparelho, sem enviar o arquivo para lugar nenhum.
- **Leitura em voz alta** com vozes neurais (Piper) rodando no próprio aparelho, em **português do Brasil** e **inglês**.
- **Exportar áudio em MP3** da página atual, do capítulo ou do documento inteiro.
- **Destaques e comentários**, exportáveis junto com o PDF.
- **Tradução** opcional entre português e inglês.
- **Funciona offline** depois da primeira visita — instale como app (PWA).
- **Paleta "papel e tinta"**: creme no modo claro, carvão quente no escuro e modo AMOLED.

## Rodar localmente

```bash
git clone --recurse-submodules https://github.com/paescoelho/LeiaMe.git
cd LeiaMe
python3 -m http.server 8000
# abra http://localhost:8000
```

## Alterar as cores

As cores do Tailwind ficam em `src/css/input.css` (bloco `@theme`). Depois de editar, gere o CSS de novo:

```bash
npx @tailwindcss/cli@4 -i src/css/input.css -o src/css/output.css
```

As variáveis do leitor (fundos, painéis, botões, realces) ficam no topo de `src/css/style.css`.

## Opcional

- **Google Drive**: veja [`assets/GOOGLE_DRIVE_SETUP.md`](assets/GOOGLE_DRIVE_SETUP.md).
- **Servidor próprio** (voz no servidor e sincronização): `server.py`, `Dockerfile` e `compose.yml`.

## Responsável

**Rodrigo Paes Coelho Santana** — [paescoelho@gmail.com](mailto:paescoelho@gmail.com)

## Licença

Código aberto sob a **GNU GPL v3** — veja [`LICENSE`](LICENSE).
Componentes de terceiros: PDF.js, pdf-lib, foliate-js, ONNX Runtime, Piper e lamejs, cada um sob sua própria licença.
