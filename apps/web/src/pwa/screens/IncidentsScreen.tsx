import { t } from '../i18n'
import { useLanguage } from '../language'
import { screenStrings } from './strings'

export function IncidentsScreen() {
  const { lang } = useLanguage()
  return (
    <section className="card">
      <h2>{t(lang, screenStrings.incidents.title)}</h2>
    </section>
  )
}
