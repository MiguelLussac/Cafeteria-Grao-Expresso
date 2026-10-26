# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Pedidos e pagamentos (Sprint 2)

Use `createOrder`, `listOrders`, `getOrder`, `registerSimulatedPayment` e
`updateOrderStatus` de `src/services/api.js`.
Veja assinaturas, exemplos, autenticação e erros em
[docs/frontend_orders.md](../docs/frontend_orders.md).
Execute `npm test` para os testes do serviço e `python -m pytest -q` na raiz
para a integração com Flask (Node.js 20+ necessário).
