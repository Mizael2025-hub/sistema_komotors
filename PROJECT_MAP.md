# PROJECT_MAP — sistema-komotors

> Módulo 1 do sistema "Baterias" (fábrica de baterias de motos). Fonte de verdade do PRD: `prd.md`.

## Stack

- **Monorepo** pnpm workspaces: `apps/web` (Next.js 16 App Router) · `packages/shared` (Zod + tipos de domínio)
- **Backend**: route handlers do Next.js (full-stack, serverless)
- **Banco**: PostgreSQL gerenciado **Supabase** (`sa-east-1`) via Prisma 6
- **Auth**: JWT (jose) — access 15min + refresh 30d com rotação; hash argon2id (`@node-rs/argon2`)
- **UI**: Tailwind CSS 4, PT-BR, mobile-first
- **Deploy**: Vercel (rootDirectory=`apps/web`), CI por push na `main`
- **Nota arquitetural**: Redis/BullMQ do PRD foi substituído por filas no Postgres (pg-boss, futuro); servidor local do PRD foi substituído por Vercel+Supabase (tudo free tier)

## Nomenclatura

- Domínio: PT-BR **sem acentos**, snake_case (`lote_chumbo.qtd_barras`)
- Rotas/infra: inglês (`POST /api/lead-lots`)
- UI/mensagens: português brasileiro com acentos
- Toda tabela com `created_at` / `updated_at`; pesos `Decimal(10,2)` (nunca float)

## Banco (Prisma — `apps/web/prisma/schema.prisma`)

Tabelas: `usuario`, `liga_chumbo`, `setor`, `colaborador`, `modelo_grade`, `polaridade`, `lote_chumbo`, `monte_chumbo`, `movimentacao_chumbo`, `contagem_chumbo`, `log_auditoria`, `notificacao`, `token_refresh`.

Enums: `PerfilUsuario`, `StatusMonte`, `TipoMovimentacao`, `AcaoAuditoria`, `CorLiga`, `Polaridade`, `TipoFornecedor`.

Regras-chave:
- `monte_chumbo` posicionado por `@@unique([lote_id, linha, coluna])`; peso exibido = `peso_real ?? peso_estimado`
- `movimentacao_chumbo` append-only (edições geram novas movimentações); `idempotency_key` única para sync offline
- `log_auditoria` imutável (sem update/delete pela aplicação)

## Fluxos implementados

1. **Login** (`POST /api/auth/login`) → cookies httpOnly (`komotors_access`, `komotors_refresh`) → registro em `token_refresh` → auditoria de login
2. **Refresh com rotação** (`POST /api/auth/refresh`): valida hash no banco, revoga o antigo, cria novo
3. **Logout**: revoga refresh + limpa cookies
4. **RBAC**: `ADMIN` (tudo) e `OPERADOR` (futuro); guardas em `@/lib/auth/sessao` (autorização revalidada no backend)
5. **Configurações** (`/api/config/{ligas|setores|colaboradores|modelos-grade|polaridades}`): CRUD com auditoria, dupla validação (Zod compartilhado), bloqueio de desativação com vínculos
6. **Health**: `/api/health` (sem banco), `/api/health/ready` (com banco)

## Proteção de rotas

- `src/proxy.ts` (Next 16 — substitui middleware): redireciona sem cookie de acesso → `/login`
- APIs verificam sessão em cada rota (`exigirSessao` / `exigirAdmin`)

## Estrutura

```
apps/web/src/
├── app/                  # rotas (App Router)
│   ├── api/              # auth/*, config/*, health*
│   ├── login/            # tela de login
│   ├── configuracoes/    # CRUDs base (abas)
│   └── page.tsx          # menu principal
├── lib/
│   ├── auth/             # jwt, senha, sessão (cookies, rotação, RBAC)
│   ├── api/              # erros padronizados PT-BR + cliente fetch
│   ├── configuracoes/    # servico + rotas helpers
│   └── prisma.ts         # singleton PrismaClient
├── components/
└── proxy.ts              # guarda de rotas
packages/shared/src/      # dominio.ts, auth.ts, configuracoes.ts (Zod)
```

## Operações

- **Dev local**: `pnpm dev` (workspace) ou `pnpm --filter web dev`
- **Migrations**: `pnpm --filter web db:migrate -- --name <nome>` (aplica direto no Supabase)
- **Seed**: `pnpm --filter web db:seed` (cria ADMIN via `ADMIN_EMAIL`/`ADMIN_SENHA` do `.env`)
- **Deploy**: commit/push na `main` → Vercel (GitHub connection). Envs na Vercel: `DATABASE_URL`, `JWT_SECRET`
- **Migrations em prod**: ainda locais; automatizar via Vercel cron/CI é pendência

## Log de Execução

- [x] 2026-09-09 — Último passo concluído: **módulo de autenticação + configurações no ar** (login/refresh/logout/me + CRUD de configurações com auditoria; seed ADMIN; testes locais de regressão OK)
- [ ] Próximo passo pendente: **Chumbo — entrada de lote (apontamento com grade 2D)** + seed de dados de demonstração
