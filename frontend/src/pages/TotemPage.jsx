import { useState } from 'react'
import { Link, Outlet } from 'react-router-dom'
import { ArrowRight, Coffee, LayoutGrid, MessageSquare } from 'lucide-react'
import { OrderProvider } from '../context/OrderContext'
import './totem.css'

export function TotemLayout() {
  const [largeText, setLargeText] = useState(false)
  return (
    <OrderProvider>
      <main className={largeText ? 'totem totem-large' : 'totem'}>
        <header className="totem-brand">
          <strong><Coffee aria-hidden="true" /> Grão Expresso</strong>
          <button type="button" className="btn btn-outline" aria-pressed={largeText}
            onClick={() => setLargeText((current) => !current)}>A+ Texto maior</button>
        </header>
        <Outlet />
      </main>
    </OrderProvider>
  )
}

export function TotemHome() {
  return (
    <div className="totem-home">
      <section aria-labelledby="totem-title">
        <h1 id="totem-title">O que vai ser hoje?</h1>
        <p>Faça seu pedido aqui e acompanhe pelo número na tela de retirada.</p>
        <div className="totem-options">
          <Link className="totem-option totem-option-order" to="/totem/cardapio">
            <LayoutGrid aria-hidden="true" />
            <strong>Montar meu pedido</strong>
            <span>Escolha no cardápio, do seu jeito.</span>
            <ArrowRight className="totem-arrow" aria-hidden="true" />
          </Link>
          <button className="totem-option" type="button" disabled>
            <MessageSquare aria-hidden="true" />
            <span className="totem-soon">Em breve</span>
            <strong>Pedir conversando com o assistente</strong>
            <span>Escreva o que quer, como falaria no balcão.</span>
          </button>
        </div>
      </section>
      <footer><span>Toque em uma opção para começar</span><span>Pix · Cartão · Dinheiro</span></footer>
    </div>
  )
}
