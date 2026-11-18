import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, MessageSquare, Send, Sparkles } from 'lucide-react'
import { useOrder } from '../context/OrderContext'
import { assistantChat } from '../services/api'
import { Alert, Button } from '../components/ui'
import ProductSelection from '../components/ProductSelection'
import {
  ASSISTANT_GREETING, ASSISTANT_SUGGESTIONS, MAX_MESSAGE_CHARS,
  cartForApi, historyForApi, itemsFromAssistant,
} from '../utils/assistant'

const FIRST_MESSAGE = { role: 'assistant', content: ASSISTANT_GREETING, local: true }

export default function TotemAssistantPage() {
  const { items, replaceItems, createdOrder, isSubmitting } = useOrder()
  const [messages, setMessages] = useState([FIRST_MESSAGE])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null) // { text, unavailable }
  const [ready, setReady] = useState(false)
  const logRef = useRef(null)
  const inputRef = useRef(null)
  const locked = isSubmitting || !!createdOrder

  useEffect(() => {
    const log = logRef.current
    if (log) log.scrollTop = log.scrollHeight
  }, [messages, sending])

  async function send(text) {
    const content = text.trim()
    if (!content || sending || locked) return
    const conversation = [...messages, { role: 'user', content }]
    setMessages(conversation)
    setDraft('')
    setError(null)
    setSending(true)
    try {
      const result = await assistantChat(historyForApi(conversation), cartForApi(items))
      setMessages((current) => [...current, { role: 'assistant', content: result.reply }])
      replaceItems(itemsFromAssistant(result.cart))
      setReady(result.ready_to_checkout)
    } catch (err) {
      // Devolve o texto ao campo para o cliente tentar de novo sem redigitar.
      setMessages((current) => current.slice(0, -1))
      setDraft(content)
      setError({ text: err.message, unavailable: err.status === 503 })
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  function handleSubmit(event) {
    event.preventDefault()
    send(draft)
  }

  const onlyGreeting = messages.length === 1

  return (
    <div className="totem-menu totem-chat">
      <header className="page-header">
        <div>
          <Link className="btn btn-outline" to="/totem">← Início</Link>
          <h1>Peça conversando</h1>
          <p className="page-subtitle">
            Escreva o que você quer. Os itens entram sozinhos em "Seu pedido".
          </p>
        </div>
      </header>

      <ProductSelection totem />

      <section className="card chat" aria-label="Conversa com o assistente">
        <ol className="chat-log" ref={logRef} aria-live="polite" aria-relevant="additions">
          {messages.map((m, i) => (
            <li key={i} className={`chat-message chat-${m.role}`}>
              {m.role === 'assistant' && (
                <span className="chat-avatar" aria-hidden="true"><MessageSquare size={18} /></span>
              )}
              <p>
                <span className="visually-hidden">{m.role === 'assistant' ? 'Assistente: ' : 'Você: '}</span>
                {m.content}
              </p>
            </li>
          ))}
          {sending && (
            <li className="chat-message chat-assistant chat-typing" role="status">
              <span className="chat-avatar" aria-hidden="true"><MessageSquare size={18} /></span>
              <p>Pensando<span aria-hidden="true">…</span></p>
            </li>
          )}
        </ol>

        {ready && items.length > 0 && !locked && (
          <Link className="btn btn-primary btn-block chat-checkout" to="/totem/pedido/resumo">
            Revisar e pagar <ArrowRight size={18} aria-hidden="true" />
          </Link>
        )}

        {error && (
          <Alert variant="error" title={error.unavailable ? 'Assistente indisponível' : 'Não deu certo.'}
            onClose={() => setError(null)}>
            {error.text}{' '}
            {error.unavailable && <Link to="/totem/cardapio">Montar pelo cardápio</Link>}
          </Alert>
        )}

        {onlyGreeting && (
          <div className="chat-suggestions" aria-label="Sugestões">
            {ASSISTANT_SUGGESTIONS.map((s) => (
              <button key={s} type="button" className="chip" disabled={sending || locked} onClick={() => send(s)}>
                {s}
              </button>
            ))}
          </div>
        )}

        <form className="chat-form" onSubmit={handleSubmit}>
          <label className="visually-hidden" htmlFor="chat-input">Sua mensagem</label>
          <input id="chat-input" ref={inputRef} className="chat-input" type="text" autoComplete="off"
            placeholder={locked ? 'Pedido já registrado' : 'Ex.: um latte e um cookie'}
            maxLength={MAX_MESSAGE_CHARS} value={draft} disabled={locked}
            onChange={(e) => setDraft(e.target.value)} />
          <Button type="submit" disabled={sending || locked || !draft.trim()} aria-label="Enviar mensagem">
            <Send size={18} aria-hidden="true" />
          </Button>
        </form>
        <p className="chat-note">
          <Sparkles size={12} aria-hidden="true" /> Assistente com IA. Confira o pedido antes de pagar.
        </p>
      </section>
    </div>
  )
}
