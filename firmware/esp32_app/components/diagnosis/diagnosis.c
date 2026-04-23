/*
 * diagnosis.c
 *
 * 역할:
 * - 수집된 센서 데이터를 바탕으로 진단 지표를 계산하는 모듈
 * - Lmatch, Lgrad, Lsafety를 계산하고 최종 진단 레벨을 산출함
 * - 센서 이상 조건이 있으면 device fault 후보도 판정함
 * 
 */