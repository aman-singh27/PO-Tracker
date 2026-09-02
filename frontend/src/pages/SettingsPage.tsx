import { useEffect, useState } from "react"
import { Save, SlidersHorizontal } from "lucide-react"
import { toast } from "sonner"
import { settingsApi } from "../api/client"
import { Button, Card, Input } from "../components/ui"

type SettingsForm = {
  stuck_after_days: string
  overdue_after_days: string
}

export function SettingsPage() {
  const [form, setForm] = useState<SettingsForm>({ stuck_after_days: "", overdue_after_days: "" })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    settingsApi.get()
      .then(r => setForm({
        stuck_after_days: r.data.stuck_after_days?.toString() ?? "",
        overdue_after_days: r.data.overdue_after_days?.toString() ?? "",
      }))
      .catch(() => setError("Could not load tracker settings."))
  }, [])

  async function save() {
    setSaving(true)
    setError("")
    try {
      await settingsApi.update(form)
      toast.success("Alert settings saved")
    } catch {
      setError("Could not save. Enter whole numbers or leave a field blank to disable the alert.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="page narrow-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Shared tracker rules</p>
          <h1>Alert settings</h1>
          <p className="subtle">
            These rules apply to everyone. Leave a value blank to turn that alert off until you decide a policy.
          </p>
        </div>
      </header>

      <Card className="form-card settings-card">
        <SlidersHorizontal size={24} />
        <div>
          <h2>When should the team be alerted?</h2>
          <p>
            These settings never change the PO data — they only decide what appears in the attention lists.
          </p>
        </div>

        <div className="form-grid">
          <label>
            Work stuck after
            <Input
              inputMode="numeric"
              value={form.stuck_after_days}
              onChange={e => setForm(f => ({ ...f, stuck_after_days: e.target.value }))}
              placeholder="e.g. 30"
            />
            <small>days from PO date</small>
          </label>
          <label>
            Payment overdue after
            <Input
              inputMode="numeric"
              value={form.overdue_after_days}
              onChange={e => setForm(f => ({ ...f, overdue_after_days: e.target.value }))}
              placeholder="e.g. 45"
            />
            <small>days from bill date (unless a client has its own terms)</small>
          </label>
        </div>

        {error && <div className="inline-alert" role="alert">{error}</div>}

        <div className="form-actions">
          <Button onClick={save} disabled={saving}>
            <Save size={16} />{saving ? "Saving…" : "Save alert settings"}
          </Button>
        </div>
      </Card>
    </section>
  )
}
