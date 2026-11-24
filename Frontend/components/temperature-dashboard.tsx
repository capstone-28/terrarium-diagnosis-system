'use client'

import { useState } from 'react'
import { useEffect } from 'react'
import { ArrowRight, Lightbulb, Settings } from 'lucide-react'
import { AlertNotification } from './alert-notification'
import { AirTempsCard } from './air-temps-card'
import { DiagnosticsPanel } from './diagnostics-panel'
import { getObservedHeat, HeatSourceStatus } from './heat-source-status'
import { HistorySheet } from './history-sheet'
import { RecentMeasurements } from './recent-measurements'
import { SettingsSheet } from './settings-sheet'
import { StatsPanel } from './stats-panel'
import { SurfaceTempCard } from './surface-temp-card'
import { ZoneChart } from './zone-chart'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import {
  fetchHeartbeat,
  fetchLatestReading,
  fetchNode,
  fetchReadings,
  getDefaultNodeId,
  getGradient,
  isHeartbeatOnline,
} from '@/lib/temperature-api'
import type { HeartbeatDtoType, Node, State, TerrariumReading } from '@/lib/types'

const stateLabels: Record<State, string> = {
  normal: 'Normal',
  warning: 'Warning',
  critical: 'Critical',
  device_fault: 'Device Fault',
}

function createEmptyReading(nodeId: string): TerrariumReading {
  const timestamp = new Date(0)

  return {
    id: `${nodeId}-empty`,
    schema: 'terrarium-diagnosis.v1',
    node_id: nodeId,
    topic: `terrarium/terrarium_01/${nodeId}/summary`,
    topic_prefix: 'terrarium/terrarium_01',
    message_type: 'summary',
    timestamp_ms: 0,
    received_at: timestamp.toISOString(),
    timestamp,
    state: 'normal',
    state_changed: false,
    qos: 0,
    retain: false,
    message_expiry_ms: 30000,
    diagnosis: {},
    sensor_status: {
      usable_for_diagnosis: false,
      response_failure: false,
      missing_value: true,
      out_of_range_value: false,
      persistent_out_of_range_value: false,
      repeated_value: false,
      hot_surface_ok: false,
      hot_air_ok: false,
      cool_air_ok: false,
      light_ok: false,
    },
    source: 'sensor',
    adjustment: 0,
    surface_temp_c: null,
    hot_air_temp_c: null,
    cool_air_temp_c: null,
    light_level: null,
    heat_source_on: false,
    l_match: null,
    l_grad: null,
    l_safety: null,
    l_fault: null,
    l_final: null,
    fault_reason: null,
  }
}

const chartTitles = { hot: '온열 공기 온도', cool: '냉각 공기 온도', surface: '온열 표면 온도', gradient: '두 구역 공기 온도차' }

function DiagnosticGuide({ reading, stale }: { reading: TerrariumReading | null; stale: boolean }) {
  const state = reading?.state
  const label = state === 'critical' ? '위험' : state === 'warning' ? '주의' : state === 'device_fault' ? '장치 이상' : state === 'normal' ? '정상' : '진단 데이터 없음'
  const tone = stale ? 'border-gray-300 bg-gray-50 text-gray-900' : state === 'critical' ? 'border-red-300 bg-red-50 text-red-950' : state === 'warning' ? 'border-amber-300 bg-amber-50 text-amber-950' : state === 'normal' ? 'border-emerald-300 bg-emerald-50 text-emerald-950' : 'border-gray-300 bg-gray-50 text-gray-900'
  const level = state === 'critical' ? 2 : 1
  const causes: string[] = []
  const actions: string[] = []
  if (reading && (state === 'critical' || state === 'warning')) {
    if (reading.l_safety === level) { causes.push('온열 표면 고온'); actions.push('표면 온도와 열원 출력을 확인하세요.') }
    if (reading.l_match === level) { causes.push('열원 ON 추정 대비 표면 온도 상승 부족'); actions.push('램프 발열과 표면 센서 부착 위치를 확인하세요.') }
    if (reading.l_grad === level) { causes.push('온열·냉각 구역 온도차 부족'); actions.push('두 공기 센서의 위치와 구역별 온도를 확인하세요.') }
  }
  if (state === 'device_fault') {
    causes.push('센서 또는 측정 데이터에 이상이 감지됐습니다.')
    actions.push('센서 연결과 전원을 확인하세요. 기존 측정값을 현재 상태로 간주하지 마세요.')
  }
  const fallback = state === 'normal' ? '최근 ESP32 진단에서 이상이 보고되지 않았습니다.' : state ? '세부 원인은 진단 지표와 이력을 확인하세요.' : '사육장 노드의 측정 기록을 기다리고 있습니다.'
  return (
    <section aria-live="polite" className={`rounded-2xl border p-4 shadow-sm ${tone}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">{stale && reading ? '마지막 진단 · ' : ''}{label}</h2>
        {reading && <span className="text-xs">수신 {reading.timestamp.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} KST</span>}
      </div>
      <p className="mt-1 text-sm">{causes.length ? causes.join(' · ') : fallback}</p>
      {actions.length > 0 && <p className="mt-2 text-sm font-semibold">{stale ? '마지막 진단의 점검 안내: ' : '점검: '}{actions.join(' ')}</p>}
    </section>
  )
}

function TerrariumMap({ reading, onChart }: { reading: TerrariumReading | null; onChart: (zone: keyof typeof chartTitles) => void }) {
  const heat = getObservedHeat(reading).on
  const status = reading?.sensor_status
  const gradient = reading && status?.hot_air_ok && status.cool_air_ok ? getGradient(reading) : null
  const value = (temp: number | null | undefined) => typeof temp === 'number' && Number.isFinite(temp) ? `${temp.toFixed(1)} °C` : '--'
  const sensor = (zone: keyof typeof chartTitles, temp: number | null | undefined, ok: boolean | undefined) => (
    <button type="button" onClick={() => onChart(zone)} className="w-full rounded-xl border border-white bg-white/90 p-2.5 text-left shadow-sm hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2">
      <span className="block text-xs font-medium text-gray-700">{chartTitles[zone]}</span>
      <span className="block text-lg font-bold tabular-nums">{value(ok === true ? temp : null)}</span>
      <span className={`text-[11px] ${ok === false ? 'text-red-700' : 'text-gray-600'}`}>{ok === false ? '센서 이상' : ok === true && value(temp) !== '--' ? '측정 가능' : '확인 불가'}</span>
    </button>
  )
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <h2 className="text-sm font-bold">사육장 열환경 단면도</h2>
      <p className="mb-3 mt-1 text-xs text-gray-600">{!reading ? '측정 데이터 없음' : reading.message_type === 'summary' ? '최근 구간 평균' : '기록 시점 측정값'} · 센서 카드를 누르면 추이가 열립니다.</p>
      <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-gray-300">
        <div className="border-r border-dashed border-gray-300 bg-orange-50 p-2 sm:p-4">
          <p className="mb-2 text-xs font-bold text-orange-900">온열 구역</p>
          <div className="mb-2 flex min-h-10 items-center gap-1.5 text-xs text-orange-900">
            <Lightbulb aria-hidden="true" className={`size-5 shrink-0 ${heat === true ? 'fill-amber-300 text-amber-800 motion-safe:animate-pulse' : 'text-gray-500'}`} />
            <span>{heat === null ? '열원 확인 불가' : heat ? '열원 ON 추정' : '열원 OFF 추정'}</span>
          </div>
          {sensor('hot', reading?.hot_air_temp_c, status?.hot_air_ok)}
        </div>
        <div className="bg-sky-50 p-2 sm:p-4">
          <p className="mb-2 text-xs font-bold text-sky-900">냉각 구역</p>
          <p className="mb-2 flex min-h-10 items-center text-xs text-sky-900">열원 반대편</p>
          {sensor('cool', reading?.cool_air_temp_c, status?.cool_air_ok)}
        </div>
        <button type="button" onClick={() => onChart('gradient')} className="col-span-2 flex flex-wrap items-center justify-center gap-2 border-y border-gray-200 bg-gray-50 p-2 text-xs font-semibold hover:bg-gray-100">
          온열 공기 <ArrowRight aria-hidden="true" className="size-4" /> 냉각 공기 <span>ΔT (온열 − 냉각): {value(gradient)}</span>
        </button>
        <div className="border-r border-dashed border-orange-200 bg-orange-100 p-2 sm:p-4">{sensor('surface', reading?.surface_temp_c, status?.hot_surface_ok)}</div>
        <div className="flex items-center justify-center bg-sky-100 p-2 text-xs text-sky-900">냉각 구역 바닥</div>
      </div>
    </section>
  )
}

export function TemperatureDashboard() {
  const [historySheetOpen, setHistorySheetOpen] = useState(false)
  const [settingsSheetOpen, setSettingsSheetOpen] = useState(false)
  const [activeChartZone, setActiveChartZone] = useState<'hot' | 'cool' | 'gradient' | 'surface' | null>(null)
  const [readings, setReadings] = useState<TerrariumReading[]>([])
  const [latestReading, setLatestReading] = useState<TerrariumReading | null>(null)
  const [node, setNode] = useState<Node | null>(null)
  const [heartbeat, setHeartbeat] = useState<(HeartbeatDtoType & { received_at?: string }) | null>(null)
  const [apiError, setApiError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    let pending = false
    const nodeId = getDefaultNodeId()

    const loadDashboardData = async (showLoading = false) => {
      if (cancelled || pending) return
      pending = true
      if (showLoading) setIsLoading(true)

      try {
        const [nextNode, latest, nextReadings, nextHeartbeat] = await Promise.all([
          fetchNode(nodeId),
          fetchLatestReading(nodeId),
          fetchReadings(nodeId, 30),
          fetchHeartbeat(nodeId),
        ])

        if (cancelled) return
        setNode(nextNode)
        setLatestReading(latest)
        setReadings(nextReadings)
        setHeartbeat(nextHeartbeat)
        setApiError(null)
      } catch (error) {
        if (cancelled) return
        setApiError(error instanceof Error ? error.message : 'API connection failed')
      } finally {
        pending = false
        if (!cancelled && showLoading) setIsLoading(false)
      }
    }

    loadDashboardData(true)
    const intervalId = window.setInterval(() => loadDashboardData(false), 5000)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [])

  const hasLiveReading = latestReading !== null
  const displayReading = latestReading ?? createEmptyReading(getDefaultNodeId())
  const state = displayReading.state
  const heartbeatOnline = isHeartbeatOnline(heartbeat)
  const heartbeatReceivedAt = heartbeat?.received_at ? new Date(heartbeat.received_at) : null
  const heartbeatLabel = heartbeatReceivedAt
    ? heartbeatReceivedAt.toLocaleTimeString('en-US', { hour12: false })
    : '-'
  const stateColor = !hasLiveReading
    ? 'text-gray-500'
    : state === 'normal'
      ? 'text-emerald-600'
      : state === 'warning'
        ? 'text-amber-500'
        : state === 'device_fault'
          ? 'text-purple-500'
          : 'text-red-500'
  const dotColor = !hasLiveReading
    ? 'bg-gray-400'
    : state === 'normal'
      ? 'bg-emerald-500'
      : state === 'warning'
        ? 'bg-amber-500'
        : state === 'device_fault'
          ? 'bg-purple-500'
          : 'bg-red-500'

  return (
    <div className="min-h-screen select-none bg-gray-100 pb-8">
      <AlertNotification reading={latestReading} />

      <header className="flex items-center justify-between bg-transparent px-4 pb-4 pt-6">
        <div className="min-w-0 shrink">
          <h1 className="flex items-center gap-1 text-xl font-bold text-emerald-600 md:text-2xl">
            Terrarium
          </h1>
          <p className="mt-0.5 truncate text-[10px] text-gray-400 md:text-xs">
            {node ? `${node.name} / ${node.location}` : displayReading.node_id}
          </p>
        </div>

        <div className="ml-2 flex items-center gap-1.5 md:gap-4">
          <div className="flex flex-col items-start whitespace-nowrap rounded-xl border border-gray-200/60 bg-white px-2 py-1 shadow-3xs md:rounded-2xl md:px-4 md:py-1.5">
            <div className="flex items-center gap-1 text-xs">
              <span className="flex items-center gap-0.5 text-[9px] font-bold text-emerald-600 md:text-[10px]">
                <span
                  className={`inline-block size-1 rounded-full ${
                    heartbeatOnline ? 'animate-pulse bg-emerald-500' : 'bg-gray-400'
                  }`}
                />
                {apiError || !heartbeatReceivedAt ? '연결 확인 불가' : heartbeatOnline ? 'MQTT online' : 'MQTT offline'}
              </span>
            </div>
            <span className="mt-0.5 font-mono text-[9px] text-gray-400 md:text-[10px]">
              heartbeat{' '}
              {heartbeatLabel}
            </span>
          </div>

          <div className="flex h-[38px] items-center gap-1 whitespace-nowrap rounded-full border border-gray-200/60 bg-white px-2.5 shadow-3xs md:h-[46px] md:gap-2 md:px-4">
            <span className="relative flex size-1.5 shrink-0">
              <span
                className={`absolute inline-flex size-full animate-ping rounded-full ${dotColor} opacity-75`}
              />
              <span className={`relative inline-flex size-1.5 rounded-full ${dotColor}`} />
            </span>
            <span className={`text-[10px] font-extrabold md:text-xs ${stateColor}`}>
              {hasLiveReading ? stateLabels[state] : 'No Data'}
            </span>
          </div>

          <button
            onClick={() => setSettingsSheetOpen(true)}
            className="flex size-9 shrink-0 items-center justify-center rounded-full border border-gray-200/60 bg-white shadow-3xs transition-all hover:bg-gray-50 active:scale-95 md:size-11"
          >
            <Settings className="size-4 text-zinc-500 md:size-5" />
          </button>
        </div>
      </header>

      <div className="space-y-3 px-4">
        {(!hasLiveReading || apiError || isLoading) && (
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-xs text-gray-500 shadow-sm">
            {isLoading
              ? 'Loading backend data...'
              : apiError
                ? hasLiveReading ? 'API 갱신 실패 · 마지막 수신 데이터 표시 중' : 'API 연결 실패 · 표시할 데이터 없음'
                : 'No readings have been received yet.'}
          </div>
        )}

        <DiagnosticGuide reading={latestReading} stale={Boolean(apiError) || (Boolean(heartbeatReceivedAt) && !heartbeatOnline)} />
        <TerrariumMap reading={latestReading} onChart={setActiveChartZone} />

        <SurfaceTempCard
          surfaceTemp={displayReading.surface_temp_c}
          hotAirTemp={displayReading.hot_air_temp_c}
          coolAirTemp={displayReading.cool_air_temp_c}
          updatedAt={hasLiveReading ? displayReading.timestamp : null}
          source={displayReading.source}
          heatSourceOn={hasLiveReading && displayReading.heat_source_on}
          statusLabel={hasLiveReading ? `${stateLabels[state]} from ESP32 diagnosis` : 'No live data'}
        />

        <AirTempsCard
          hotAirTemp={displayReading.hot_air_temp_c}
          coolAirTemp={displayReading.cool_air_temp_c}
          heatSourceOn={hasLiveReading && displayReading.heat_source_on}
          updatedAt={hasLiveReading ? displayReading.timestamp : null}
          onHotZoneClick={() => setActiveChartZone('hot')}
          onCoolZoneClick={() => setActiveChartZone('cool')}
        />

        <HeatSourceStatus reading={hasLiveReading ? displayReading : null} />
        <DiagnosticsPanel
          latestReading={displayReading}
          readings={readings}
          onGradientClick={() => setActiveChartZone('gradient')}
        />

        <RecentMeasurements readings={readings} onViewAll={() => setHistorySheetOpen(true)} />
        <StatsPanel readings={readings} latestReading={hasLiveReading ? displayReading : null} />
      </div>

      <Dialog open={activeChartZone !== null} onOpenChange={(open) => !open && setActiveChartZone(null)}>
        <DialogContent className="max-w-[95vw] overflow-hidden rounded-2xl border-none bg-white p-0 shadow-xl sm:max-w-[500px]">
          <DialogTitle className="sr-only">Zone Temperature Chart</DialogTitle>

          {activeChartZone && (
            <ZoneChart
              title={chartTitles[activeChartZone]}
              subtitle="최근 수신 기록 최대 30건 · 시간축: 서버 수신 시각"
              type={activeChartZone}
              data={readings.map(reading => {
                const heat = getObservedHeat(reading)
                return {
                  timestamp: reading.timestamp,
                  heatOn: heat.on,
                  heatDurationMs: heat.durationMs,
                  temperature: activeChartZone === 'surface'
                    ? (reading.sensor_status.hot_surface_ok ? reading.surface_temp_c : null)
                    : activeChartZone === 'hot'
                      ? (reading.sensor_status.hot_air_ok ? reading.hot_air_temp_c : null)
                      : activeChartZone === 'cool'
                        ? (reading.sensor_status.cool_air_ok ? reading.cool_air_temp_c : null)
                        : (reading.sensor_status.hot_air_ok && reading.sensor_status.cool_air_ok ? getGradient(reading) : null),
                }
              })}
            />
          )}
        </DialogContent>
      </Dialog>

      <HistorySheet open={historySheetOpen} onOpenChange={setHistorySheetOpen} readings={readings} />
      <SettingsSheet open={settingsSheetOpen} onOpenChange={setSettingsSheetOpen} />
    </div>
  )
}

