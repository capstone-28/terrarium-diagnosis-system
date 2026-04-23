/*
 * main.c
 *
 * 역할:
 * - 시스템 전체 초기화 및 실행 흐름을 관리하는 진입점
 * - sensors, diagnosis, state_logic, comms 모듈을 순서대로 호출함
 * - 주기적 태스크를 실행하여 전체 파이프라인을 조립함
 *
 */

#include <stdio.h>

void app_main(void)
{
    printf("Hello world!\n");
}
