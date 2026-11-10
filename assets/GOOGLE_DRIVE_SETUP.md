# Sincronização com o Google Drive (opcional)

O LeiaMe pode sincronizar PDFs, EPUBs, posição de leitura, voz e destaques com o Google Drive do usuário.
Ele cria uma pasta visível chamada `LeiaMe` e pede apenas a permissão `drive.file`, que dá acesso somente
aos arquivos criados ou abertos pelo próprio app.

Para funcionar no seu endereço, é preciso criar um ID OAuth próprio no Google Cloud (feito uma vez só).

## 1. Projeto e tela de consentimento

1. Acesse o [Google Cloud Console](https://console.cloud.google.com/) e crie um projeto (ex.: `LeiaMe`).
2. Em **APIs e serviços → Biblioteca**, ative a **Google Drive API**.
3. Em **APIs e serviços → Tela de consentimento OAuth**, escolha **Externo**, informe `LeiaMe` como nome do app
   e `paescoelho@gmail.com` como e-mail de suporte e do desenvolvedor.
4. Em **Domínios autorizados**, adicione `paescoelho.github.io`.
5. Em **Escopos**, adicione `https://www.googleapis.com/auth/drive.file`.
6. Enquanto o app estiver em **modo de teste**, adicione em **Usuários de teste** as contas Google que vão usar
   a sincronização (até 100). Para liberar a qualquer pessoa, o Google exige publicar o app e informar links de
   política de privacidade e termos de uso.

## 2. ID do cliente OAuth

1. Em **APIs e serviços → Credenciais → Criar credenciais → ID do cliente OAuth**, escolha **Aplicativo da Web**.
2. Nome: `LeiaMe Web`.
3. Em **Origens JavaScript autorizadas**, adicione apenas:

   ```text
   https://paescoelho.github.io
   ```

   Sem `/LeiaMe/` e sem barra no final. Para testes locais, adicione também `http://localhost:8000`.
4. Não é preciso URI de redirecionamento.
5. Copie o **ID do cliente** (termina em `.apps.googleusercontent.com`). Nunca coloque a chave secreta no app.

## 3. Configurar o app

Em `src/config.js`, troque o valor de `GOOGLE_DRIVE_CLIENT_ID` pelo seu ID, faça commit e publique.

## 4. Conectar

1. Abra o [LeiaMe](https://paescoelho.github.io/LeiaMe/).
2. Toque no ícone de nuvem e escolha **Continuar com o Google**.
3. Autorize o acesso. A pasta `LeiaMe` aparece no seu Drive.

O token do Google expira em pouco tempo e fica só na sessão do navegador. Se aparecer **É preciso reconectar**,
conecte de novo; os documentos neste aparelho continuam disponíveis enquanto isso.

## Problemas comuns

- **Erro 400: origin_mismatch** — a origem do navegador não está em **Origens JavaScript autorizadas**.
  Para o app publicado, ela é `https://paescoelho.github.io`.
- **Acesso bloqueado / app não verificado** — a conta não está na lista de **Usuários de teste**.
- **Janela de login fecha sozinha** — o LeiaMe usa isolamento de origem para acelerar a voz; use um navegador
  atualizado (Chrome, Edge ou Firefox recentes).

Cada documento sincronizado tem um arquivo de dados ao lado, chamado `.NOME_DO_DOCUMENTO.leiame.json`.
