import { useCallback, useEffect, useState } from 'react'
import { supabase, errMsg, publicUrl } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import type { Profile } from '../../lib/types'
import { Empty, Field, Spinner, useToast } from '../../components/ui'
import { IconImage, IconUpload, IconX } from '../../components/icons'

interface Photo { id: string; barber_id: string; path: string; caption: string | null }

export default function Gallery() {
  const { profile, isAdmin } = useAuth()
  const toast = useToast()
  const [barbers, setBarbers] = useState<Profile[]>([])
  const [who, setWho] = useState(profile?.id ?? '')
  const [photos, setPhotos] = useState<Photo[] | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!isAdmin) return
    void supabase.from('profiles').select('*').eq('is_barber', true).eq('active', true).order('full_name').then(({ data }) => setBarbers((data as Profile[]) ?? []))
  }, [isAdmin])

  const load = useCallback(async () => {
    if (!who) return
    const { data } = await supabase.from('gallery_photos').select('*').eq('barber_id', who).order('created_at', { ascending: false })
    setPhotos((data as Photo[]) ?? [])
  }, [who])
  useEffect(() => { setPhotos(null); void load() }, [load])

  const upload = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    try {
      for (const f of Array.from(files).slice(0, 10)) {
        const ext = (f.name.split('.').pop() ?? 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
        const path = `gallery/${who}/${crypto.randomUUID()}.${ext}`
        const up = await supabase.storage.from('shop').upload(path, f, { contentType: f.type })
        if (up.error) throw up.error
        const { error } = await supabase.from('gallery_photos').insert({ barber_id: who, path })
        if (error) throw error
      }
      toast('Fotos subidas')
    } catch (e) {
      toast(errMsg(e), true)
    } finally {
      setBusy(false)
      void load()
    }
  }

  const remove = async (p: Photo) => {
    if (!confirm('¿Quitar esta foto de la galería?')) return
    await supabase.storage.from('shop').remove([p.path])
    const { error } = await supabase.from('gallery_photos').delete().eq('id', p.id)
    if (error) toast(errMsg(error), true)
    else void load()
  }

  return (
    <div className="page stack">
      <h1>Galería de trabajos</h1>
      <p className="ink2">Los clientes ven las últimas 6 fotos al elegir barbero. Sube cortes bien iluminados, sin caras si el cliente no quiere.</p>
      {isAdmin && barbers.length > 1 && (
        <div className="seg" role="tablist" aria-label="Barbero">
          {barbers.map((b) => <button key={b.id} role="tab" aria-selected={who === b.id} className="chip" onClick={() => setWho(b.id)}>{b.full_name}</button>)}
        </div>
      )}
      <Field label="Subir fotos">
        <input type="file" accept="image/*" multiple disabled={busy} onChange={(e) => void upload(e.target.files)} />
      </Field>
      {busy && <p className="muted small row"><IconUpload size={18} />Subiendo…</p>}
      {photos === null ? <Spinner rows={2} /> : photos.length === 0 ? (
        <div className="panel"><Empty icon={<IconImage size={28} />} title="Todavía no hay fotos">Sube tus mejores cortes para que los clientes te elijan.</Empty></div>
      ) : (
        <div className="gallery">
          {photos.map((p) => (
            <div key={p.id} style={{ position: 'relative' }}>
              <img src={publicUrl(p.path) ?? ''} alt="Corte de la galería" loading="lazy" />
              <button className="btn icon" aria-label="Quitar foto" onClick={() => void remove(p)}
                style={{ position: 'absolute', top: 4, right: 4, minHeight: 32, width: 32, borderRadius: 999 }}><IconX size={16} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
