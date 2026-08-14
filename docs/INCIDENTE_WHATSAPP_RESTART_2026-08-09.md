# Incidente de sessões WhatsApp após restart — 09/08/2026

## Constatação

Após a correção do ambiente do VPS para `NODE_ENV=production` e o restart controlado da API:

- API: `status=ok`, `ready=true`, banco `up`;
- saúde pública: `env=production`;
- tabela `whatsapp_instances`: 12 registros, todos `disconnected`;
- `auth_whatsapp`: diretórios presentes, porém sem `creds.json` restaurável;
- runtime: 0 sessões WhatsApp ativas após o restart.

O processo anterior mantinha 12 instâncias em memória, mas não havia credenciais persistidas suficientes para reconstruí-las após reinício. Portanto, o problema é de persistência/pareamento de sessão, não de endpoint HTTP.

## Impacto

Envio, recebimento e distribuição que dependam de WhatsApp ficam indisponíveis até o pareamento das instâncias. O sistema não deve ser vendido como operacional para WhatsApp enquanto isso não for resolvido.

## Contenção aplicada

- nenhuma sessão falsa foi criada;
- nenhuma mensagem foi enviada;
- nenhuma instância ou contato foi apagado;
- o `.env` anterior foi preservado no VPS como `/root/leadcapture/.env.bak-20260809-1535`;
- o serviço permaneceu online em modo de produção com banco saudável.

## Recuperação necessária

1. Parear novamente cada instância autorizada pelo responsável, via QR ou código de pareamento.
2. Confirmar que cada sessão grava `auth_whatsapp/<instance_id>/creds.json`.
3. Reiniciar a API uma vez e confirmar restauração automática.
4. Testar recebimento, envio controlado e distribuição com um único contato de teste.
5. Criar backup protegido das credenciais de sessão e um teste de restore em staging.

Não é seguro executar os passos de pareamento automaticamente nem inventar credenciais em produção.
