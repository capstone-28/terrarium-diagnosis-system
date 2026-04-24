/*
 * main.c
 *
 * 역할:
 * - 시스템 전체 초기화 및 실행 흐름을 관리하는 진입점
 * - 지금은 sensors 모듈만 호출해서 온도센서 1개 값을 테스트함
 */

#include <stdio.h>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_err.h"
#include "esp_log.h"

#include "sensors.h"

static const char *TAG = "app_main";

#define SENSOR_READ_INTERVAL_MS 1000
#define SENSOR_INIT_RETRY_DELAY_MS 3000
#define SENSOR_RECOVERY_THRESHOLD 3

static void wait_for_sensor_ready(void)
{
    esp_err_t err = ESP_OK;

    do {
        err = sensors_init();
        if (err == ESP_OK) {
            return;
        }

        ESP_LOGE(TAG, "sensor init failed: %s", esp_err_to_name(err));
        vTaskDelay(pdMS_TO_TICKS(SENSOR_INIT_RETRY_DELAY_MS));
    } while (1);
}

void app_main(void)
{
    unsigned int consecutive_read_failures = 0;

    wait_for_sensor_ready();

    while (1) {
        sensor_data_t sensor_data = {0};
        esp_err_t err = sensors_read_all(&sensor_data);

        if (err == ESP_OK && sensor_data.hot_surface_ok) {
            consecutive_read_failures = 0;
            printf("Hot surface temp: %.2f C\n", sensor_data.hot_surface_temp_c);
        } else {
            consecutive_read_failures++;
            ESP_LOGW(TAG, "sensor read failed: %s", esp_err_to_name(err));

            if (err == ESP_ERR_INVALID_STATE || consecutive_read_failures >= SENSOR_RECOVERY_THRESHOLD) {
                ESP_LOGW(TAG, "reinitializing sensors after %u consecutive failures",
                         consecutive_read_failures);
                sensors_deinit();
                wait_for_sensor_ready();
                consecutive_read_failures = 0;
            }
        }

        vTaskDelay(pdMS_TO_TICKS(SENSOR_READ_INTERVAL_MS));
    }
}
