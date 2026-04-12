# 데이터 규격

## 기본 규칙
- 형식: JSON
- 필드명: snake_case
- 시간: ISO 8601
- 결측값: null
- 값이 없거나 해당되지 않으면 null 사용

## 공통 필드
- timestamp: 메시지 생성 시각
- node_id: 노드 식별자
- message_type: 메시지 종류
- state: normal | warning | critical | device_fault

## 메시지 종류
- summary: 평시 요약
- event: warning
- alert: critical
- fault: device_fault
- heartbeat: 생존 확인

## 센서 필드
- surface_temp_c: 온열 구역 표면 온도
- hot_air_temp_c: 온열 구역 공기 온도
- cool_air_temp_c: 냉각 구역 공기 온도
- light_level: 조도값
- heat_source_on: 열원 작동 여부

## 진단 필드
- l_match: 0 | 1 | 2
- l_grad: 0 | 1 | 2
- l_safety: 0 | 1 | 2
- l_final: 0 | 1 | 2
- fault_reason: 장치 이상 원인

## 예시
```json
{
  "timestamp": "2026-04-12T20:00:00+09:00",
  "node_id": "node-01",
  "message_type": "summary",
  "state": "normal",
  "surface_temp_c": 39.2,
  "hot_air_temp_c": 34.8,
  "cool_air_temp_c": 27.1,
  "light_level": 812,
  "heat_source_on": true,
  "l_match": 0,
  "l_grad": 0,
  "l_safety": 0,
  "l_final": 0,
  "fault_reason": null
}
```