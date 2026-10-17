import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import { useAuth } from '../auth/AuthProvider'
import { useLanguage } from '../pwa/language'
import { PermissionsPanel } from '../pwa/install/PermissionsPanel'
import { authHeadersFor } from '../pwa/api/authHeaders'
import { createHttpApi } from '../pwa/api/client'
import { ApiError } from '../pwa/api/types'
import { usePermissions } from '../pwa/permissions/usePermissions'
import { Shield } from './VolunteerAuthShell'
import './createAccount.css'
import { useSignIn } from './useSignIn'
import { volunteerSignInError } from './copy'
import { LanguageDropdown } from '../pwa/DisplayControls'
import { isE164Phone, normalizeE164Phone } from './accountValidation'

const copy = {
  back: { id: 'Masuk', en: 'Sign in' },
  stepAccount: { id: 'LANGKAH 1 DARI 2 · AKUN ANDA', en: 'STEP 1 OF 2 · YOUR ACCOUNT' },
  title: { id: 'Bergabung dengan regu pemadam desa', en: 'Join your village fire crew' },
  intro: { id: 'Atur nomor telepon Anda. Panduan tersedia kapan saja di menu Panduan.', en: 'Set up your phone once. Training is in Guide whenever you are ready.' },
  google: { id: 'Terdaftar dengan Google · ganti', en: 'Signed up with Google · change' },
  googleStart: { id: 'Daftar dengan Google', en: 'Sign up with Google' },
  googleRequired: { id: 'Daftar dengan Google untuk melengkapi akun relawan Anda.', en: 'Sign up with Google to complete your volunteer account.' },
  googleBusy: { id: 'Sedang mendaftar…', en: 'Signing up…' },
  name: { id: 'Nama Anda', en: 'Your name' },
  nameHint: { id: 'Dari Google. Regu Anda melihat nama ini.', en: 'From Google. Your crew sees this name.' },
  phone: { id: 'Nomor untuk SMS', en: 'Phone for SMS' },
  phoneHint: { id: 'Digunakan saat tidak ada internet di lokasi kebakaran.', en: 'Used when there is no internet at a fire.' },
  area: { id: 'Desa / wilayah', en: 'Village / area' },
  crew: { id: 'Regu pemadam', en: 'Fire crew' },
  crewHint: { id: 'Ketua regu mengonfirmasi Anda sebelum tugas pertama.', en: 'Your crew lead confirms you before your first task.' },
  language: { id: 'Bahasa pelatih', en: 'Coach language' },
  languageHint: { id: 'Bahasa yang digunakan EMBER saat berbicara kepada Anda.', en: 'What EMBER speaks to you in.' },
  continue: { id: 'Lanjutkan', en: 'Continue' },
  stepPermissions: { id: 'LANGKAH 2 DARI 2 · IZIN APLIKASI', en: 'STEP 2 OF 2 · APP PERMISSIONS' },
  permissionTitle: { id: 'Siapkan ponsel Anda', en: 'Set up your phone' },
  permissionIntro: { id: 'EMBER memerlukan izin ini untuk mengirim laporan dengan cepat. Anda dapat mengubahnya nanti di Profil → Izin.', en: 'EMBER needs these to report fast. You can change them later in Profile → Permissions.' },
  permissionBack: { id: 'Kembali ke akun', en: 'Back to account' },
  permissionContinue: { id: 'Lanjutkan ke Beranda', en: 'Continue to Home' },
  required: { id: 'Lengkapi semua kolom untuk melanjutkan.', en: 'Complete every field to continue.' },
  invalidPhone: { id: 'Masukkan nomor telepon internasional yang valid, misalnya +6281234567890.', en: 'Enter a valid international phone number, for example +6281234567890.' },
  saveFailed: { id: 'Detail akun tidak dapat disimpan. Periksa koneksi lalu coba lagi.', en: 'Your account details could not be saved. Check your connection and try again.' },
  saveValidation: { id: 'Periksa kembali nama, nomor, desa, dan regu Anda.', en: 'Check your name, phone, village, and crew details, then try again.' },
} as const

function text(lang: 'id' | 'en', value: { id: string; en: string }) {
  return value[lang]
}

export function VolunteerCreateAccountScreen() {
  const { user, me, status, signOut, refreshMe } = useAuth()
  const { busy, message, onGoogle } = useSignIn('volunteer')
  const registered = status === 'ready' && me?.role === 'volunteer'
  const { lang, language } = useLanguage()
  const { perms, asking, request } = usePermissions()
  const navigate = useNavigate()
  const [name, setName] = useState(me?.displayName || user?.displayName || '')
  const [phone, setPhone] = useState('')
  const [area, setArea] = useState(me?.area ?? '')
  const [crew, setCrew] = useState(me?.crewName ?? '')
  const [step, setStep] = useState<'account' | 'permissions'>('account')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (registered) setName((current) => current || me?.displayName || user?.displayName || '')
  }, [registered, me?.displayName, user?.displayName])

  const api = createHttpApi(authHeadersFor(user))
  async function changeGoogleAccount() {
    await signOut()
    setName('')
    setPhone('')
    setArea('')
    setCrew('')
  }
  const values = {
    displayName: name.trim(),
    phone: normalizeE164Phone(phone),
    area: area.trim(),
    crewName: crew.trim(),
    language,
  } as const

  async function saveProfile(onboardingComplete: boolean) {
    if (!user || !registered) {
      setError(text(lang, copy.saveFailed))
      return false
    }
    setSaving(true)
    setError(null)
    try {
      await api.patchMe({ ...values, onboardingComplete })
      return true
    } catch (cause) {
      setError(text(lang, cause instanceof ApiError && cause.code === 'validation_error' ? copy.saveValidation : copy.saveFailed))
      return false
    } finally {
      setSaving(false)
    }
  }

  async function continueToPermissions(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!values.displayName || !values.phone || !values.area || !values.crewName) {
      setError(text(lang, copy.required))
      return
    }
    if (!isE164Phone(phone)) {
      setError(text(lang, copy.invalidPhone))
      return
    }
    if (await saveProfile(false)) setStep('permissions')
  }

  async function finishSetup() {
    if (!(await saveProfile(true))) return
    await refreshMe({ quiet: true })
    navigate('/pwa', { replace: true })
  }

  return (
    <main className="create-account">
      <div className="create-account-frame">
        {step === 'account' ? (
          <>
            <button className="create-account-back" type="button" onClick={() => { void signOut().then(() => navigate('/pwa')) }}>
              <span aria-hidden="true">←</span> {text(lang, copy.back)}
            </button>
            <div className="create-account-display"><LanguageDropdown /></div>
            <p className="create-account-step">{text(lang, copy.stepAccount)}</p>
            <h1>{text(lang, copy.title)}</h1>
            <p className="create-account-intro">{text(lang, copy.intro)}</p>
            <button className="create-account-google" type="button" disabled={busy} aria-busy={busy} onClick={() => { if (registered) void changeGoogleAccount(); else void onGoogle() }}>
              <span className="create-account-google-mark" aria-hidden="true">G</span>
              <span className="create-account-google-copy">
                <strong>{registered ? user?.email : text(lang, busy ? copy.googleBusy : copy.googleStart)}</strong>
                <span>{text(lang, registered ? copy.google : copy.googleRequired)}</span>
              </span>
            </button>
            {message && !busy ? <p className="create-account-error" role="alert">{volunteerSignInError(message, lang).body}</p> : null}
            <form className="create-account-form" onSubmit={(event) => { void continueToPermissions(event) }} noValidate>
              <fieldset className="create-account-fields" disabled={!registered || saving}>
              <label>
                <span>{text(lang, copy.name)}</span>
                <input autoComplete="name" maxLength={80} name="displayName" onChange={(event) => setName(event.target.value)} required value={name} />
                <small>{text(lang, copy.nameHint)}</small>
              </label>
              <label>
                <span>{text(lang, copy.phone)}</span>
                <input autoComplete="tel" inputMode="tel" maxLength={24} name="phone" onChange={(event) => setPhone(event.target.value)} placeholder="+62 812 3456 7890" required type="tel" value={phone} />
                {me?.phoneMasked ? <small>{text(lang, copy.phoneHint)} · {me.phoneMasked}</small> : <small>{text(lang, copy.phoneHint)}</small>}
              </label>
              <label>
                <span>{text(lang, copy.area)}</span>
                <input autoComplete="address-level2" maxLength={100} name="area" onChange={(event) => setArea(event.target.value)} required value={area} />
              </label>
              <label>
                <span>{text(lang, copy.crew)}</span>
                <input maxLength={100} name="crewName" onChange={(event) => setCrew(event.target.value)} required value={crew} />
                <small>{text(lang, copy.crewHint)}</small>
              </label>
              <fieldset className="create-account-language">
                <legend>{text(lang, copy.language)}</legend>
                <p>{text(lang, copy.languageHint)}</p>
                <LanguageDropdown />
              </fieldset>
              {error ? <p className="create-account-error" role="alert">{error}</p> : null}
              <button className="create-account-primary" disabled={saving} type="submit" aria-busy={saving}>
                {saving ? (lang === 'id' ? 'Menyimpan…' : 'Saving…') : text(lang, copy.continue)}
              </button>
              </fieldset>
            </form>
          </>
        ) : (
          <>
            <header className="create-account-identity">
              <Shield size={32} />
              <div><strong>{name}</strong><span>{crew} · {area}</span></div>
              <div className="create-account-language-switch" role="group" aria-label={text(lang, copy.language)}>
                <LanguageDropdown />
              </div>
            </header>
            <p className="create-account-step">{text(lang, copy.stepPermissions)}</p>
            <h1>{text(lang, copy.permissionTitle)}</h1>
            <p className="create-account-intro">{text(lang, copy.permissionIntro)}</p>
            <PermissionsPanel perms={perms} asking={asking} lang={lang} onRequest={(key) => { void request(key) }} />
            {error ? <p className="create-account-error" role="alert">{error}</p> : null}
            <div className="create-account-permission-actions">
              <button className="create-account-primary" disabled={saving} type="button" onClick={() => { void finishSetup() }} aria-busy={saving}>
                {saving ? (lang === 'id' ? 'Menyimpan…' : 'Saving…') : text(lang, copy.permissionContinue)}
              </button>
              <button className="create-account-secondary" type="button" disabled={saving} onClick={() => setStep('account')}>
                {text(lang, copy.permissionBack)}
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  )
}
