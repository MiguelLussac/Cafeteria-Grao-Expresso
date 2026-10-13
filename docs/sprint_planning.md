# Planejamento da Sprint e Atividades — Cafeteria Grão Expresso
**Squad 50**  
**Projeto:** Sistema de Pedidos — Cafeteria “Grão Expresso”  
**Base Arquitetural:** Documento de Arquitetura de Solução (DAS)

---

## 1. Visão Geral e Objetivo da Release

Desenvolver uma solução enxuta e eficiente para modernizar o atendimento da Cafeteria Grão Expresso. O sistema substitui o processo manual em papel por uma arquitetura em camadas composta por:
- **API REST monolítica em Python 3 + Flask**
- **Banco de Dados Relacional (MySQL / SQLite)**
- **Totem/Tela de Atendente e Painel da Cozinha em React com notificações em tempo real via SSE**

O escopo do projeto é focado em loja única, sem delivery, com pagamento simulado e alta confiabilidade nos horários de pico.

---

## 2. Divisão das Sprints

### 🟢 Sprint 1: Fundação, Contratos de API e Arquitetura do Backend Flask (Sprint Atual)
**Objetivo:** Estruturar a base completa do backend, modelagem de dados, regras de negócio centrais, contratos da API e infraestrutura inicial para destravar o desenvolvimento paralelo das telas e integrações.

#### Atividades da Sprint 1:
1. **Estrutura Base e Application Factory (Flask):**
   - Configuração de ambientes (`DevelopmentConfig`, `TestingConfig`, `ProductionConfig`).
   - Padrão Application Factory (`create_app()`).
   - Configuração de extensões: SQLAlchemy (ORM), CORS (para comunicação com o frontend React), Migrate.
   - Tratamento centralizado de erros em JSON (400, 401, 403, 404, 500).

2. **Modelagem de Dados Relacional:**
   - `User`: Credenciais com hash seguro e papéis de acesso (`admin`, `atendente`, `barista`).
   - `Product`: Nome, descrição, preço, categoria (`bebidas`, `doces`, `salgados`) e status ativo.
   - `Order`: Número/Comanda, cliente, status (`recebido` -> `em_preparo` -> `pronto` -> `entregue` -> `cancelado`), valor total, timestamp.
   - `OrderItem`: Associação entre Pedido e Produto, quantidade e preço unitário congelado no momento da venda.
   - `Payment`: Registro de pagamento simulado (`dinheiro`, `cartao`, `pix`), valor pago e status (`pago`).

3. **Definição dos Requisitos e Contratos da API:**
   - Criação da documentação formal de contratos (`docs/api_contracts.md`).
   - Criação da especificação OpenAPI 3.0 (`docs/openapi.yaml`) para integração com o frontend.

4. **Implementação dos Endpoints REST Core:**
   - `GET /api/v1/health`: Verificação de saúde da API.
   - `POST /api/v1/auth/login` e `GET /api/v1/auth/me`: Autenticação JWT com decorators `@jwt_required` e `@role_required`.
   - `GET, POST, PUT, DELETE /api/v1/products`: CRUD completo do cardápio.
   - `POST, GET /api/v1/orders`: Criação de pedido com cálculo automático de totais e listagem com filtros.
   - `PATCH /api/v1/orders/<id>/status`: Transição de status para a cozinha/barista.
   - `POST /api/v1/orders/<id>/payment`: Registro do pagamento simulado.
   - `GET /api/v1/events/orders`: Endpoint SSE para notificações em tempo real.

5. **Testes Automatizados e Seed Inicial:**
   - Fixtures com `pytest` e banco SQLite em memória.
   - Script de seed automático para popular dados de demonstração ao iniciar em desenvolvimento.

---

### 🟡 Sprint 2: Painel da Cozinha / Barista & Notificações em Tempo Real
**Objetivo:** Desenvolver a experiência do Barista para visualizar a fila de pedidos e atualizar status em tempo real sem recarregar a tela.

#### Atividades da Sprint 2:
1. Criação do app React para o Painel da Cozinha.
2. Integração do painel com o stream Server-Sent Events (SSE) da API Flask para escutar novos pedidos e alterações de status.
3. Interface com cartões Kanban/listagem por status:
   - Coluna **Recebido**
   - Coluna **Em Preparo**
   - Coluna **Pronto**
4. Botões de ação rápida para o barista avançar o pedido com 1 clique (chamando `PATCH /api/v1/orders/<id>/status`).
5. Alerta sonoro e visual ao receber novos pedidos.

---

### 🟡 Sprint 3: Totem / Atendimento & Registro de Pedidos
**Objetivo:** Desenvolver a interface do cliente/atendente para selecionar produtos, fechar pedido e registrar o pagamento simulado.

#### Atividades da Sprint 3:
1. Criação do app React para o Totem / Atendente.
2. Consumo de produtos via `GET /api/v1/products` com filtro por categorias (Bebidas, Doces, Salgados).
3. Componente de Carrinho de Compras com adição, remoção e cálculo de subtotal.
4. Tela de Checkout:
   - Identificação do cliente ou mesa/comanda.
   - Seleção da forma de pagamento simulado: Dinheiro, Cartão ou Pix.
   - Envio do pedido via `POST /api/v1/orders` e pagamento via `POST /api/v1/orders/<id>/payment`.
5. Tela de Acompanhamento do Pedido:
   - Conexão SSE para notificar o cliente na tela com som e destaque visual assim que a cozinha marcar o pedido como **Pronto**.

---

### 🟡 Sprint 4: Deploy, Observabilidade & Homologação
**Objetivo:** Publicar a aplicação no Render, configurar o banco de dados MySQL em nuvem, instrumentar monitoramento e realizar testes de integração.

#### Atividades da Sprint 4:
1. Configuração do ambiente no Render (PaaS) conectado ao repositório GitHub.
2. Provisionamento da instância MySQL e configuração da string de conexão `DATABASE_URL`.
3. Configuração do Sentry para rastreamento de exceções e monitoramento de performance.
4. Testes de ponta a ponta (E2E) simulando o ciclo completo: Pedido no Totem -> Painel do Barista -> Notificação de Pronto ao Cliente.
5. Elaboração da documentação de entrega final e manual de operação.

---

## 3. Matriz de Responsabilidades (Squad 50)

| Membro / Papel | Foco Principal | Entregáveis Chave |
|---|---|---|
| **Engenheiro Backend (Lead)** | API Flask, Banco de Dados, Segurança e SSE | Endpoints REST, Modelos SQLAlchemy, JWT, Testes e Documentação de Contratos |
| **Engenheiro Frontend 1** | Painel da Cozinha (React) | Interface do Barista, consumo de SSE, transição de status em tempo real |
| **Engenheiro Frontend 2** | Totem / Atendimento (React) | Cardápio interativo, carrinho, seleção de pagamento e tela de aviso de pronto |
| **DevOps / QA** | Deploy no Render, Sentry e Testes | CI/CD GitHub -> Render, banco MySQL, suíte de testes de integração e homologação |
