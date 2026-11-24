'use client'

import { Flame } from 'lucide-react'
import type { TerrariumReading } from '@/lib/types'

// Do not use the normalized boolean: the API mapper defaults missing values to false.
export function getObservedHeat(reading: TerrariumReading | null) {
  const valid = reading?.heat_source?.state_ok ?? reading?.features?.heat_source_state_ok
  const on = reading?.heat_source?.on ?? reading?.features?.heat_source_on
  const duration = reading?.heat_source?.on_duration_ms ?? reading?.features?.heat_source_on_duration_ms
  return {
    on: valid === true && typeof on === 'boolean' ? on : null,
    durationMs: valid === true && on === true && typeof duration === 'number' && Number.isFinite(duration) && duration >= 0 ? duration : null,
  }
}

export function HeatSourceStatus({ reading }: { reading: TerrariumReading | null }) {
  const { on, durationMs } = getObservedHeat(reading)
  const seconds = durationMs === null ? null : Math.floor(durationMs / 1000)
  return (
    <section className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm">
      <Flame aria-hidden="true" className={on === true ? 'text-orange-600' : 'text-gray-400'} />
      <div className="flex-1">
        <h3 className="text-sm font-semibold">열원 작동 추정</h3>
        <p className="text-xs text-gray-600">조도 기반 · 실제 전원이나 발열을 직접 확인하지 않음</p>
        {seconds !== null && <p className="mt-1 text-xs">ON 지속 시간: {Math.floor(seconds / 60)}분 {seconds % 60}초</p>}
      </div>
      <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold">{on === null ? '확인 불가' : on ? 'ON 추정' : 'OFF 추정'}</span>
    </section>
  )
}
