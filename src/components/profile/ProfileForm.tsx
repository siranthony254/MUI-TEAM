'use client'

import { useRef, useState } from 'react'
import { buttonClass, inputClass } from '@/components/ui'
import { Avatar } from '@/components/Avatar'
import { createClient } from '@/lib/supabase/client'
import { prepareAvatarUpload, saveProfile } from '@/app/profile-actions'

export interface ProfileValues {
  fullName: string
  preferredName: string
  avatarUrl: string | null
  phone: string
  notifyEmail: boolean
  notifyPush: boolean
  notifySms: boolean
  emergencyContact: string
}

/** Used for first-login setup (complete) and for editing later (Account page). */
export function ProfileForm({ values, complete }: { values: ProfileValues; complete?: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(values.avatarUrl)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(''); setOk(''); setBusy(true)
    try {
      const fd = new FormData(e.currentTarget)
      const file = fileRef.current?.files?.[0]
      fd.delete('photo')
      if (file) {
        const prep = await prepareAvatarUpload(file.name, file.size, file.type)
        if (prep.error || !prep.path || !prep.token) throw new Error(prep.error ?? 'Could not upload the photo.')
        const { error: upErr } = await createClient().storage.from('avatars').uploadToSignedUrl(prep.path, prep.token, file, { contentType: file.type })
        if (upErr) throw new Error('The photo upload failed. Check your connection and try again.')
        fd.set('avatar_path', prep.path)
      }
      if (complete) fd.set('complete', '1')
      const res = await saveProfile(undefined, fd)   // redirects on completion
      if (res?.error) throw new Error(res.error)
      if (res?.ok) setOk(res.ok)
    } catch (err) {
      // A redirect from the server action surfaces as a thrown navigation; let it through.
      const msg = err instanceof Error ? err.message : ''
      if (!/NEXT_REDIRECT/.test(msg)) setError(msg || 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="flex items-center gap-4">
        <Avatar name={values.fullName} url={preview} size={64} />
        <label className="block text-sm font-medium">Profile photo (optional)
          <input ref={fileRef} name="photo" type="file" accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) setPreview(URL.createObjectURL(f)) }}
            className={`${inputClass} file:mr-3 file:rounded file:border-0 file:bg-neutral-100 file:px-3 file:py-1`} />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">Preferred name
          <input name="preferred_name" defaultValue={values.preferredName} placeholder={values.fullName.split(' ')[0]} className={inputClass} />
          <span className="mt-1 block text-xs font-normal text-neutral-500">What we call you in greetings.</span>
        </label>
        <label className="block text-sm font-medium">Phone number
          <input name="phone" type="tel" defaultValue={values.phone} placeholder="0712 345 678" className={inputClass} />
          <span className="mt-1 block text-xs font-normal text-neutral-500">Used for text alerts, and you can sign in with it.</span>
        </label>
      </div>

      <fieldset>
        <legend className="text-sm font-medium">How should we reach you?</legend>
        <div className="mt-1 space-y-1 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" name="notify_email" defaultChecked={values.notifyEmail} /> Email</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="notify_push" defaultChecked={values.notifyPush} /> Push notifications on my devices</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="notify_sms" defaultChecked={values.notifySms} /> Text messages for the important things</label>
        </div>
      </fieldset>

      <label className="block text-sm font-medium">Emergency contact (optional, private)
        <input name="emergency_contact" defaultValue={values.emergencyContact} placeholder="Name and phone number" className={inputClass} />
        <span className="mt-1 block text-xs font-normal text-neutral-500">Only you and a system admin can see this.</span>
      </label>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {ok && <p role="status" className="text-sm text-green-700">{ok}</p>}
      <button disabled={busy} className={buttonClass}>{busy ? 'Saving…' : complete ? 'Finish setup' : 'Save profile'}</button>
    </form>
  )
}
