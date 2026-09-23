import Link from 'next/link'
import { Sparkles } from 'lucide-react'
import { requireMember } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { fmtDateTime } from '@/lib/time'
import { Card, PageTitle, SectionTitle, EmptyState } from '@/components/ui'
import { KnowledgeForm, QuestionForm } from './AssistantAdmin'

export const dynamic = 'force-dynamic'

export default async function AssistantAdmin() {
  const me = await requireMember()
  const canManageOrgWide = me.role === 'super_admin' || me.is_director
  const myDepartments = new Set(me.directed_departments ?? [])
  const canManageAny = canManageOrgWide || myDepartments.size > 0
  if (!canManageAny) {
    return <Card><p className="text-sm text-neutral-600">Only a system admin, the Executive Director, or a department's own director can teach Ask MUI.</p></Card>
  }

  const supabase = await createClient()
  const [{ data: knowledge }, { data: questions }, { data: departments }] = await Promise.all([
    supabase.from('assistant_knowledge').select('*').order('updated_at', { ascending: false }),
    supabase.from('assistant_questions').select('*, team_members!assistant_questions_asked_by_fkey(full_name)').is('resolved_at', null).order('created_at', { ascending: false }),
    supabase.from('departments').select('id, name'),
  ])
  const deptName = (id: string | null) => (departments ?? []).find((d) => d.id === id)?.name ?? 'Everyone'
  const pickableDepartments = (departments ?? []).filter((d) => canManageOrgWide || myDepartments.has(d.id))
  const editable = (rowDept: string | null) => canManageOrgWide || (rowDept !== null && myDepartments.has(rowDept))

  return (
    <>
      <Link href="/admin" className="text-sm text-neutral-500 hover:underline">← System admin</Link>
      <div className="mt-2" />
      <PageTitle sub="What Ask MUI knows, and the questions it couldn't answer well.">Ask MUI</PageTitle>

      <SectionTitle icon={Sparkles}>Questions waiting for an answer</SectionTitle>
      {(questions ?? []).length === 0 ? (
        <Card><EmptyState label="Nothing waiting." hint="When someone marks an answer as not helpful, it shows up here." /></Card>
      ) : (
        <div className="space-y-2">
          {(questions ?? []).map((q) => (
            <Card key={q.id}>
              <p className="text-sm font-medium">{q.question}</p>
              <p className="mt-0.5 text-xs text-neutral-500">
                {(q as unknown as { team_members?: { full_name: string } }).team_members?.full_name ?? 'Someone'} · {deptName(q.department_id)} · {fmtDateTime(q.created_at)}
              </p>
              {editable(q.department_id) && <QuestionForm id={q.id} />}
            </Card>
          ))}
        </div>
      )}

      <div className="mt-8" />
      <SectionTitle icon={Sparkles}>What it's been taught</SectionTitle>
      {(knowledge ?? []).length === 0 ? (
        <Card><EmptyState label="Nothing added yet." hint="Add facts, FAQs, or how-tos specific to MUI or a department below." /></Card>
      ) : (
        <div className="space-y-2">
          {(knowledge ?? []).map((k) => (
            <Card key={k.id}>
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">{deptName(k.department_id)}</p>
              <p className="mt-0.5 font-medium">{k.topic}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-600">{k.answer}</p>
              {editable(k.department_id) && <KnowledgeForm id={k.id} departmentId={k.department_id} topic={k.topic} answer={k.answer} departments={pickableDepartments} canOrgWide={canManageOrgWide} />}
            </Card>
          ))}
        </div>
      )}

      <div className="mt-8" />
      <SectionTitle>Add something new</SectionTitle>
      <Card>
        <KnowledgeForm departments={pickableDepartments} canOrgWide={canManageOrgWide} />
      </Card>
    </>
  )
}
