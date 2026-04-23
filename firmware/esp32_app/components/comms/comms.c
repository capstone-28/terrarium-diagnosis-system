/*
 * comms.c
 *
 * 역할:
 * - 시스템 상태와 센서 데이터를 외부로 전송하는 모듈
 * - MQTT 토픽, QoS, 메시지 유형(summary/event/alert/fault)을 결정함
 * - heartbeat 및 상태 메시지를 발행함
 *
 */