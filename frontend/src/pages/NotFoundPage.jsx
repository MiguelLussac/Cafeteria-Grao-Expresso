import { Link } from 'react-router-dom'
import { Coffee } from 'lucide-react'

export default function NotFoundPage() {
  return (
    <div className="container page page-center">
      <section className="not-found">
        <div className="not-found-code" aria-hidden="true">
          4
          <span className="not-found-cup">
            <Coffee size={52} strokeWidth={2.25} />
          </span>
          4
        </div>
        <h1>Esta página não está no cardápio</h1>
        <p className="page-subtitle">
          O endereço pode ter mudado ou o link está incompleto. Que tal voltar para o cardápio?
        </p>
        <div className="not-found-actions">
          <Link to="/" className="btn btn-primary">Ver cardápio</Link>
          <Link to="/login" className="btn btn-outline">Área da equipe</Link>
        </div>
        <code className="not-found-tag">Erro 404</code>
      </section>
    </div>
  )
}
