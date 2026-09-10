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

## Sprints (adaptadas à arquitetura Vercel+Supabase) — status

| Sprint (PRD §37) | Status | Notas |
|---|---|---|
| 1 — Fundação do monorepo | ✅ | pnpm workspaces, TS strict, ESLint, `packages/shared` (Zod). Prettier/docs-MKDocs pendentes |
| 2 — Docker local | 🔁 substituída | Deploy direto na Vercel; dev local com `pnpm dev` + Supabase remoto |
| 3 — API base | ✅ | Route handlers Next.js; health/health-ready; erros PT-BR padronizados |
| 4 — Prisma e banco | ✅ | Schema completo Módulo 1 + `token_refresh`; seed ADMIN; Supabase sa-east-1 |
| 5 — Auth e RBAC | ✅ parcial | Login JWT + rotação c/ revogação; guards ADMIN/OPERADOR. **Pendente:** alteração/recuperação de senha |
| 6 — Auditoria | ✅ parcial | `registrarAuditoria` em todas as ops; timeline do monte. **Pendente:** consulta filtrável ADMIN, timeline do lote |
| 7 — Configurações | ✅ | 5 CRUDs c/ auditoria, bloqueio de desativação c/ vínculo |
| 8 — Frontend base | 🔶 parcial | Layout mobile-first. **Pendente:** TanStack Query, RHF, drawer/menu, toasts globais |
| 9 — Chumbo: Entrada | ✅ | Grade 2D expansível, popup por célula, peso estimado RF-P01 |
| 10 — Chumbo: Estoque | ✅ | Saldos RF-S07, chips por liga, cards por lote, grade viva |
| 11 — Chumbo: Ações | ✅ | Reservar/cancelar/mover/venda/editar; append-only; ordem da grade; RF-P04 |
| 12 — Reconciliação | ✅ | RF-P02/P03/P05/P06 com movimentações RECONCILIACAO/AJUSTE |
| 13 — Contagem diária | ⬜ pendente | Próxima |
| 14 — PWA offline-first | ⬜ pendente | Serwist + Dexie + fila idempotente |
| 15 — Dashboard | ⬜ pendente | |
| 16 — Relatórios XLSX/PDF | ⬜ pendente | Fila via pg-boss (sem Redis) |
| 17 — Notificações internas | ⬜ pendente | |
| 18–21 — Deploy local/Swarm/Tunnel/scripts | 🔁 substituídas | Vercel + Supabase (CI por push, envs secretas, HTTPS automático) |
| 22 — Hardening final | ⬜ pendente | |

## Log de Execução

- [x] 2026-09-09 — Último passo concluído: **módulo de autenticação + configurações no ar** (login/refresh/logout/me + CRUD de configurações com auditoria; seed ADMIN; testes locais de regressão OK)
- [x] 2026-09-09 — **Sprint Chumbo 1 (iniciada)**: schemas Zod do domínio em `packages/shared/src/chumbo.ts` (entradaLoteSchema com validação de posições da grade, reserva, moverSetor, baixaVenda, edicaoMonte, recorteMonte, redimensionarGrade) — fonte única de validação form/API
- [x] 2026-09-09 — **Serviço de domínio do chumbo** (`apps/web/src/lib/chumbo/servico.ts`): criarEntrada (lote+montes+movimentações ENTRADA em transação, peso estimado RF-P01), estoqueLiga (fórmulas RF-S07 via agregações), reservar/cancelarReserva/moverSetor/baixaVenda (movimentações append-only + auditoria transacional), reconciliarLote (RF-P02..P07 com movimentações RECONCILIACAO/AJUSTE do sistema), editarMonte (RF-M06), reposicionarMonte (drag, revalida ordem derivada), redimensionarLote (RF-S02), historicoMonte (timeline). Erros de domínio = RegraError → 409 em PT-BR
- [x] 2026-09-09 — **Rotas API do chumbo**: `POST /api/lead/lots` (entrada), `GET /api/lead/stock?liga_id` (saldos), `POST /api/lead/actions` (dispatcher reservar/cancelar-reserva/mover-setor/venda), `GET+PATCH /api/lead/piles/[id]` (histórico + edição + reposicionar por drag), `PATCH /api/lead/lots/[id]` (redimensionar grade). Writes restritos a ADMIN
- [x] 2026-09-09 — **UIs do Módulo 1 Chumbo implementadas**: `/chumbo/entrada` (grade 2D botões com popup peso/barras, expansível 1–20 linhas/colunas, resumo antes de salvar) e `/chumbo/estoque` (chips por liga com cor, cards resumo Disponível/No setor/Reservado/Vendido, cards de lote expansíveis, grade viva com status visuais, seleção múltipla, barra de ações fixa, modal de ações — Reservar/Mover ao setor/Baixa-Venda/Editar —, histórico em timeline, drag para reorganizar, clique em vazio limpa seleção)
- [x] 2026-09-10 — **Testes de regressão E2E do módulo chumbo (requests reais contra o Supabase)**: entrada L-TESTE-01 (estimados 333.33 por RF-P01) e L-TESTE-02 (EXTERNO/35 barras 266.67) · saldo disponível 999.99/30 barras (RF-S07 corrigido — bug `Decimal.plus` não mutativo) · reserva → cancelamento → mover parcial (4/10 barras, PARCIAL, peso médio) → mover total (NO_SETOR) → venda parcial (peso real 76.2 informado) → venda total com peso real → **reconciliação RF-P03** recalculou estimados do lote (432.25) · drag/reposicionamento (posição ocupada revalidada) · cancelar reserva (schema próprio sem setor) · timelines corretas · validações 409 em PT-BR para estados inválidos
- [x] 2026-09-10 — **Hardening de ambiente**: virtual store do pnpm movido para fora do OneDrive (`pnpm-workspace.yaml: virtualStoreDir`) — builds locais deixaram de falhar (EPERM do OneDrive em renames de .dll/.next); ORDEM de listagem corrigida para arrayorderBy
- [x] 2026-09-10 — **Último passo concluído: Sprints 1–4 do Módulo 1 (Chumbo) completas** — Entrada de lote (grade 2D), Estoque (cards+grade viva), Ações (reservar/mover/venda/editar/cancelar/reserva), Reconciliação de peso (RF-P01..P07)
- [x] 2026-09-10 — **Incidente resolvido: build de produção falhou** (`9431d16` → deploy ERROR). Causa: `virtualStoreDir` (caminho Windows) comitado no `pnpm-workspace.yaml`; a Vercel gerou o Prisma Client em `./../../C:/Users/...`. Fix (`2e14f9b`): config removida do arquivo versionado e movida para `~/.npmrc` global da máquina local. Deploy READY, estoque/saldos validados em produção
- [x] 2026-09-10 — **Projeto migrado do OneDrive para `C:\Users\Mizael\Projetos-Sistemas\sistema-komotors`** (robocopy /MOVE, git + .vercel + .env intactos; node_modules recriados do cache). Logo depois: configs globais do pnpm de virtual store removidas — Turbopack exige symlinks dentro do projeto; com o projeto fora do OneDrive o padrão funciona sem EPERM. Build e smoke test consistente; sem config de máquina. Work Dir definitivo do projeto
- [x] 2026-09-10 — **Auditoria de sincronização (a pedido)**: Git `main` = `origin/main` (HEAD `044d1d2`); Vercel: últimos 3 deploys READY (chumbo + docs) servindo em https://sistema-komotors.vercel.app — validado por API (`/api/lead/stock` com dados) e HTML; Supabase: banco conectado e schema em dia (health/ready 200). Sprints marcadas com [x] no PRD §37 e tabela de status adicionada aqui
- [ ] Próximo passo pendente: **Sprint 5 — Contagem diária + Revisar** (RF-CT01..CT05) ou seed demonstrativo completo
