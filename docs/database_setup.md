# Preparando o banco MySQL (ambiente local)

## Pré-requisitos

- MySQL 8.0.16+ e MySQL Workbench
- Python 3.10+ e dependências instaladas (`pip install -r requirements.txt`)

## Passo a passo

1. No Workbench, execute `db/schema.sql` (cria o banco `grao_expresso` e a tabela `products`).

2. Crie um usuário para a aplicação (troque pela sua senha, sem `@ : / # %`):

```sql
   CREATE USER 'grao_app'@'localhost' IDENTIFIED BY 'SUA_SENHA';
   GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES
     ON grao_expresso.* TO 'grao_app'@'localhost';
```

Os privilégios de CREATE/ALTER são só para desenvolvimento, porque a API cria as demais tabelas ao iniciar.

3. Copie `.env.example` para `.env` e defina:

```
   DATABASE_URL=mysql+pymysql://grao_app:SUA_SENHA@localhost:3306/grao_expresso
```

O `.env` está no `.gitignore`: nunca faça commit dele.

4. Rode `python run.py`. A API cria as tabelas restantes e os dados de demonstração.

## Observações

- Rode o `schema.sql` antes da API, para a tabela `products` nascer com as restrições (preço > 0 e categorias válidas).
- `DELETE /api/v1/products/{id}` faz exclusão lógica (`is_active = 0`).
- Sem `DATABASE_URL`, a API usa SQLite local.
