import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase, errMsg } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import type { PayMethod, Product } from '../../lib/types'
import { money } from '../../lib/format'
import { Alert, Empty, Field, Modal, Spinner, useToast } from '../../components/ui'
import { clean, focusFirstError, isValid, number, type Errors } from '../../lib/validate'
import { IconBox, IconChevronRight, IconPlus } from '../../components/icons'

type Kind = 'sale' | 'use' | 'purchase' | 'adjust'
const KIND: Record<Kind, string> = { sale: 'Venta', use: 'Uso en el local', purchase: 'Compra', adjust: 'Ajuste' }
interface Move { id: string; kind: Kind; qty: number; unit_price: number | null; unit_cost: number | null; created_at: string; products: { name: string } | null; profiles: { full_name: string } | null }

const qtyText = (n: number) => (Number.isInteger(Number(n)) ? String(Number(n)) : Number(n).toFixed(2))

export default function Inventory() {
  const { isAdmin } = useAuth()
  const toast = useToast()
  const [items, setItems] = useState<Product[] | null>(null)
  const [moves, setMoves] = useState<Move[]>([])
  const [edit, setEdit] = useState<Partial<Product> | null>(null)
  const [move, setMove] = useState<Product | null>(null)

  const load = useCallback(async () => {
    const [p, m] = await Promise.all([
      supabase.from('products').select('*').order('active', { ascending: false }).order('name'),
      supabase.from('stock_movements').select('id,kind,qty,unit_price,unit_cost,created_at,products(name),profiles:created_by(full_name)').order('created_at', { ascending: false }).limit(15),
    ])
    if (p.error) toast(errMsg(p.error), true)
    setItems((p.data as Product[]) ?? [])
    setMoves((m.data as unknown as Move[]) ?? [])
  }, [toast])
  useEffect(() => { void load() }, [load])

  const [errors, setErrors] = useState<Errors<'name' | 'price' | 'unit' | 'min'>>({})
  const patch = (p: Partial<Product>, k: 'name' | 'price' | 'unit' | 'min') => { setEdit({ ...edit, ...p }); setErrors({ ...errors, [k]: '' }) }

  const saveProduct = async () => {
    if (!edit) return
    const name = edit.name?.trim() ?? ''
    const errs = clean({
      name: !name ? 'Escribe el nombre del producto' : name.length > 60 ? 'Muy largo (máximo 60)'
        : (items ?? []).some((p) => p.id !== edit.id && p.name.toLowerCase() === name.toLowerCase()) ? 'Ya existe un producto con ese nombre' : '',
      price: number(edit.price ?? '', { min: 0, max: 100000, label: 'El precio' }),
      unit: (edit.unit ?? '').trim().length > 20 ? 'Muy largo (máximo 20)' : '',
      min: number(edit.min_stock ?? '', { min: 0, max: 100000, label: 'El mínimo' }),
    })
    setErrors(errs)
    if (!isValid(errs)) return focusFirstError()
    const row = { name, unit: edit.unit?.trim() || 'unidad', price: Number(edit.price ?? 0), min_stock: Number(edit.min_stock ?? 0), active: edit.active ?? true }
    const res = edit.id ? await supabase.from('products').update(row).eq('id', edit.id) : await supabase.from('products').insert(row)
    if (res.error) return toast(errMsg(res.error), true)
    setEdit(null)
    void load()
  }

  const low = (items ?? []).filter((p) => p.active && Number(p.stock) <= Number(p.min_stock))

  return (
    <div className="page stack">
      <h1>Inventario</h1>
      {low.length > 0 && (
        <Alert tone="warn">Se está acabando: {low.map((p) => `${p.name} (${qtyText(p.stock)})`).join(', ')}.</Alert>
      )}
      {items === null ? <Spinner rows={4} /> : items.length === 0 ? (
        <div className="panel">
          <Empty icon={<IconBox size={28} />} title="Todavía no hay productos">
            {isAdmin ? 'Agrega lo que tienes en el local: cera, gel, shampoo, navajas…' : 'El administrador todavía no cargó productos.'}
          </Empty>
        </div>
      ) : (
        <div className="list">
          {items.map((p) => {
            const isLow = p.active && Number(p.stock) <= Number(p.min_stock)
            return (
              <button key={p.id} className="item" onClick={() => setMove(p)} style={p.active ? undefined : { opacity: 0.55 }}>
                <span className="grow">
                  <span className="title">{p.name}</span>
                  <span className="sub" style={{ display: 'block' }}>Se vende a {money(p.price)}{isAdmin ? `, costó ${money(p.cost)}` : ''}</span>
                </span>
                <span className={`badge ${isLow ? 'warn' : 'ink'}`}>{qtyText(p.stock)} {p.unit}</span>
                <IconChevronRight className="muted" />
              </button>
            )
          })}
        </div>
      )}
      {isAdmin && <button className="btn block" onClick={() => setEdit({ unit: 'unidad', active: true, price: 0, min_stock: 1 })}><IconPlus size={20} />Agregar producto</button>}

      {moves.length > 0 && (
        <section className="stack tight">
          <h2>Últimos movimientos</h2>
          <div className="list">
            {moves.map((m) => (
              <div key={m.id} className="item" style={{ minHeight: 56 }}>
                <span className="grow">
                  <span className="title">{KIND[m.kind]}: {m.products?.name}</span>
                  <span className="sub" style={{ display: 'block' }}>
                    {new Date(m.created_at).toLocaleString('es-BO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })}
                    {m.profiles?.full_name ? `, por ${m.profiles.full_name.split(' ')[0]}` : ''}
                  </span>
                </span>
                <span className="price">{m.kind === 'purchase' || (m.kind === 'adjust' && m.qty > 0) ? '+' : '−'}{qtyText(Math.abs(m.qty))}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {edit && (
        <Modal title={edit.id ? 'Editar producto' : 'Nuevo producto'} onClose={() => { setEdit(null); setErrors({}) }}>
          <Field label="Nombre" error={errors.name}><input value={edit.name ?? ''} onChange={(e) => patch({ name: e.target.value }, 'name')} placeholder="Ej. Cera mate" /></Field>
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <Field label="Precio de venta (Bs)" error={errors.price}><input type="number" min="0" step="0.5" inputMode="decimal" value={edit.price ?? ''} onChange={(e) => patch({ price: e.target.value as unknown as number }, 'price')} /></Field>
            <Field label="Unidad" error={errors.unit}><input value={edit.unit ?? ''} onChange={(e) => patch({ unit: e.target.value }, 'unit')} placeholder="unidad, frasco, caja" /></Field>
          </div>
          <Field label="Avisar cuando queden" error={errors.min} hint="Cuando el stock llegue a este número, aparece el aviso de que se está acabando.">
            <input type="number" min="0" step="1" inputMode="numeric" value={edit.min_stock ?? ''} onChange={(e) => patch({ min_stock: e.target.value as unknown as number }, 'min')} />
          </Field>
          <label className="check-row"><input type="checkbox" checked={edit.active ?? true} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} />Producto activo</label>
          {!edit.id && <p className="muted small">El stock empieza en 0. Después registra una compra para sumar lo que tienes.</p>}
          <button className="btn primary block" onClick={() => void saveProduct()}>Guardar producto</button>
        </Modal>
      )}
      {move && <MoveModal p={move} isAdmin={isAdmin} onEdit={() => { setEdit(move); setMove(null) }} onClose={() => setMove(null)} onDone={() => { setMove(null); void load() }} />}
    </div>
  )
}

function MoveModal({ p, isAdmin, onEdit, onClose, onDone }: { p: Product; isAdmin: boolean; onEdit: () => void; onClose: () => void; onDone: () => void }) {
  const toast = useToast()
  const kinds: Kind[] = isAdmin ? ['sale', 'use', 'purchase', 'adjust'] : ['sale', 'use']
  const [kind, setKind] = useState<Kind>('sale')
  const [qty, setQty] = useState('1')
  const [unitCost, setUnitCost] = useState(String(p.cost || ''))
  const [method, setMethod] = useState<PayMethod>('cash')
  const [busy, setBusy] = useState(false)

  const [errors, setErrors] = useState<Errors<'qty' | 'cost'>>({})
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const n = Number(qty)
    const errs = clean({
      qty: kind === 'adjust'
        ? number(qty, { min: -100000, max: 100000, label: 'La corrección' }) || (n === 0 ? 'La corrección no puede ser 0' : Number(p.stock) + n < 0 ? `Quedaría en negativo (hay ${qtyText(p.stock)})` : '')
        : number(qty, { min: 1, max: 100000, label: 'La cantidad' }) || ((kind === 'sale' || kind === 'use') && n > Number(p.stock) ? `Solo hay ${qtyText(p.stock)} ${p.unit}` : ''),
      cost: kind === 'purchase' ? number(unitCost, { min: 0, max: 100000, label: 'El costo', optional: true }) : '',
    })
    setErrors(errs)
    if (!isValid(errs)) return focusFirstError()
    setBusy(true)
    const { error } = await supabase.from('stock_movements').insert({
      product_id: p.id, kind, qty: n,
      unit_cost: kind === 'purchase' ? Number(unitCost) || null : null,
      unit_price: kind === 'sale' ? p.price : null,
      method: kind === 'sale' ? method : null,
    })
    setBusy(false)
    if (error) return toast(errMsg(error), true)
    toast(`${KIND[kind]} registrada`)
    onDone()
  }

  return (
    <Modal title={p.name} onClose={onClose}>
      <p className="ink2">Hay <b className="num">{qtyText(p.stock)} {p.unit}</b>.</p>
      <div className="seg" role="radiogroup" aria-label="Tipo de movimiento">
        {kinds.map((k) => <button key={k} type="button" role="radio" aria-checked={kind === k} className={`chip ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}>{KIND[k]}</button>)}
      </div>
      <form className="stack" onSubmit={submit} noValidate>
        <Field label={kind === 'adjust' ? 'Corrección (usa negativo para restar, ej. -2)' : 'Cantidad'} error={errors.qty}>
          <input type="number" step="1" inputMode="numeric" value={qty} onChange={(e) => { setQty(e.target.value); setErrors({ ...errors, qty: '' }) }} />
        </Field>
        {kind === 'purchase' && <Field label="Costo por unidad (Bs)" error={errors.cost}><input type="number" min="0" step="0.5" inputMode="decimal" value={unitCost} onChange={(e) => { setUnitCost(e.target.value); setErrors({ ...errors, cost: '' }) }} /></Field>}
        {kind === 'sale' && (
          <>
            <div className="seg" role="radiogroup" aria-label="Forma de pago">
              {(['cash', 'qr', 'transfer'] as PayMethod[]).map((m) => <button key={m} type="button" role="radio" aria-checked={method === m} className={`chip ${method === m ? 'on' : ''}`} onClick={() => setMethod(m)}>{{ cash: 'Efectivo', qr: 'QR', transfer: 'Transferencia' }[m]}</button>)}
            </div>
            <p className="ink2 small">Total: <b className="num">{money(Number(qty || 0) * Number(p.price))}</b></p>
          </>
        )}
        <button className="btn primary block" disabled={busy}>Registrar {KIND[kind].toLowerCase()}</button>
      </form>
      {isAdmin && <button className="btn ghost block" onClick={onEdit}>Editar producto</button>}
    </Modal>
  )
}
