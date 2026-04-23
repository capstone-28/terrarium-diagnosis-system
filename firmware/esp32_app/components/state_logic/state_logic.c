/*
 * state_logic.c
 *
 * 역할:
 * - 진단 결과를 바탕으로 시스템 상태를 전이시키는 모듈
 * - normal, warning, critical, device fault 상태를 관리함
 * - 연속 관측 횟수 조건과 평시/진단 모드 전환 조건을 처리함
 *
 */