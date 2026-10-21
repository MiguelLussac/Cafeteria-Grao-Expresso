-- Grão Expresso: criação do banco e da tabela de produtos (MySQL 8+)
CREATE DATABASE IF NOT EXISTS grao_expresso
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE grao_expresso;

CREATE TABLE IF NOT EXISTS products (
  id          INT           NOT NULL AUTO_INCREMENT,
  name        VARCHAR(120)  NOT NULL,
  description TEXT          NULL,
  price       DECIMAL(10,2) NOT NULL,
  category    VARCHAR(50)   NOT NULL,
  is_active   TINYINT(1)    NOT NULL DEFAULT 1,
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                            ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX ix_products_name (name),
  INDEX ix_products_category (category),
  CONSTRAINT chk_products_price    CHECK (price > 0),
  CONSTRAINT chk_products_category CHECK (category IN ('bebidas','doces','salgados'))
) ENGINE=InnoDB;