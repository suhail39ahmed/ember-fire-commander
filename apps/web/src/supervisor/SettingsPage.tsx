import { t } from '../pwa/i18n'
import { chromeCopy } from './chromeCopy'
import { useConsole } from './ConsoleProvider'
import './supervisor.css'

/** `/console/settings`. There are no settings to change yet, so this says so. It is not in the menu. */
export function SettingsPage() {
  const { language } = useConsole()
  return (
    <div className="sup">
      <div className="sup-main">
        <div className="sup-state" role="status">
          <p className="sup-state-title">{t(language, chromeCopy.settings)}</p>
          <p className="sup-muted">{t(language, chromeCopy.notAvailable)}</p>
        </div>
      </div>
    </div>
  )
}
