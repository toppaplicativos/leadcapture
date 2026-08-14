# Regressão mobile do menu de atalhos — 10/08/2026

## Sintoma reproduzido

No workspace `/assistente`, em viewport de 390x844, o menu `Atalhos por área` abria visualmente, mas o chrome superior permanecia acima do drawer. O botão `Fechar menu` ficava coberto pelos ícones de canal; o toque atravessava a camada e podia navegar para Facebook ou WhatsApp.

## Causa

O menu foi movido para dentro do `WorkspaceChat` para corrigir o posicionamento desktop. No mobile ele continuou dentro do rail, enquanto o chrome do shell era um irmão com camada superior. O `z-index` do drawer, sozinho, não podia ultrapassar a camada do pai.

## Correção

- footer recebe `is-menu-open` e sobe temporariamente de camada;
- rail sobe temporariamente somente quando contém o drawer;
- estado normal do shell não cobre o cabeçalho.

## Evidência pós-deploy

- produção: build `2026-08-10T12:08:30.246Z`;
- mobile 390x844: `elementFromPoint` no botão de fechar passou a atingir o drawer;
- fechamento preserva URL `/assistente` e remove o menu;
- desktop 1440x900: menu abre em posição correta, fecha e mantém `/assistente`;
- `scrollWidth` permaneceu igual à largura da viewport no mobile;
- verify-deploy, smoke público e health passaram.
