import { t } from '../i18n'
import { useLanguage } from '../language'
import { screenStrings } from './strings'

export function GuideScreen() {
  const { lang } = useLanguage()
  return (
    <section className="card">
      <h2>{t(lang, screenStrings.guide.title)}</h2>
      <p className="muted">{t(lang, screenStrings.common.notAvailable)}</p>
    </section>
  )
}
