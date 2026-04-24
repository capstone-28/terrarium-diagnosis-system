/*
 * sensors.c
 *
 * 역할:
 * - 사육장에 연결된 센서들의 값을 읽어오는 모듈
 * - 표면 온도, 온열 구역 공기 온도, 냉각 구역 공기 온도, 조도값을 수집함
 * - 센서 읽기 실패 여부와 기본적인 값 유효성도 함께 확인함
 * 
 */

#include "sensors.h"
#include <math.h>
#include "esp_log.h"
#include "driver/gpio.h"
#include "onewire_bus.h"
#include "onewire_device.h"
#include "ds18b20.h"

static const char *TAG = "sensors";

#define DS18B20_GPIO GPIO_NUM_4 // DS18B20 센서가 연결된 GPIO 핀 번호
#define DS18B20_MIN_TEMP_C (-55.0f) // DS18B20 센서의 최소 온도 범위
#define DS18B20_MAX_TEMP_C (125.0f) // DS18B20 센서의 최대 온도 범위

static onewire_bus_handle_t s_bus = NULL; // 1-Wire 버스 핸들
static ds18b20_device_handle_t s_ds18b20 = NULL; // DS18B20 센서 핸들

// sensors_reset_data:
// 센서 데이터 구조체를 초기화하는 함수
static void sensors_reset_data(sensor_data_t *out_data)
{
    out_data->hot_surface_temp_c = 0.0f;
    out_data->hot_air_temp_c = 0.0f;
    out_data->cool_air_temp_c = 0.0f;
    out_data->light_level = 0;
    out_data->hot_surface_ok = false;
    out_data->hot_air_ok = false;
    out_data->cool_air_ok = false;
    out_data->light_ok = false;
}

// sensors_cleanup_handles:
// 1-Wire 버스와 DS18B20 센서 핸들을 정리하는 함수
static esp_err_t sensors_cleanup_handles(onewire_bus_handle_t *bus, ds18b20_device_handle_t *sensor)
{
    esp_err_t result = ESP_OK;

    // DS18B20 핸들 정리
    if (sensor != NULL && *sensor != NULL) {
        esp_err_t err = ds18b20_del_device(*sensor);
        if (err != ESP_OK) {
            ESP_LOGW(TAG, "failed to delete DS18B20 handle: %s", esp_err_to_name(err));
            result = err;
        }
        *sensor = NULL;
    }

    // 1-Wire 버스 핸들 정리
    if (bus != NULL && *bus != NULL) {
        esp_err_t err = onewire_bus_del(*bus);
        if (err != ESP_OK) {
            ESP_LOGW(TAG, "failed to delete 1-Wire bus handle: %s", esp_err_to_name(err));
            result = err;
        }
        *bus = NULL;
    }

    return result;
}

// sensors_init:
// DS18B20 센서를 찾아서 핸들을 설정하는 함수
esp_err_t sensors_init(void)
{
    onewire_bus_handle_t new_bus = NULL;
    ds18b20_device_handle_t new_ds18b20 = NULL;
    onewire_device_iter_handle_t iter = NULL;
    onewire_device_t next_onewire_device;
    esp_err_t err = ESP_OK;

    // 이미 초기화된 핸들이 있으면 정리
    if (s_bus != NULL || s_ds18b20 != NULL) {
        ESP_LOGW(TAG, "reinitializing sensor driver");
        sensors_cleanup_handles(&s_bus, &s_ds18b20);
    }

    // 1-Wire 버스 초기화
    onewire_bus_config_t bus_config = {
        .bus_gpio_num = DS18B20_GPIO,
        .flags = {
            .en_pull_up = true,
        }
    };

    // RMT 구성 설정
    onewire_bus_rmt_config_t rmt_config = {
        .max_rx_bytes = 10,
    };

    // RMT 기반 1-Wire 버스 생성
    err = onewire_new_bus_rmt(&bus_config, &rmt_config, &new_bus);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "1-Wire bus init failed: %s", esp_err_to_name(err));
        return err;
    }

    // 1-Wire 버스에 연결된 장치들을 순회하기 위한 iterator 생성
    err = onewire_new_device_iter(new_bus, &iter);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "device iterator init failed: %s", esp_err_to_name(err));
        goto cleanup;
    }

    // 1-Wire 버스에 연결된 장치들을 순회하면서 DS18B20 센서를 찾음
    while ((err = onewire_device_iter_get_next(iter, &next_onewire_device)) == ESP_OK) {
        ds18b20_config_t ds_cfg = {};
        
        // DS18B20 장치 핸들 생성 시도
        err = ds18b20_new_device_from_enumeration(&next_onewire_device, &ds_cfg, &new_ds18b20);
        if (err == ESP_OK) {
            break;
        }

        // DS18B20이 아닌 다른 1-Wire 장치가 발견된 경우
        if (err != ESP_ERR_NOT_SUPPORTED) {
            ESP_LOGE(TAG, "failed to create DS18B20 device: %s", esp_err_to_name(err));
            goto cleanup;
        }

        // 지원되지 않는 1-Wire 장치 발견 시 경고 로그 출력
        ESP_LOGW(TAG, "skipping unsupported 1-Wire device: 0x%016llX",
                 (unsigned long long)next_onewire_device.address);
    }

    // DS18B20 센서가 발견되지 않은 경우 오류 처리
    if (err == ESP_ERR_NOT_FOUND) {
        ESP_LOGE(TAG, "no DS18B20 device found on the 1-Wire bus");
        goto cleanup;
    }

    // DS18B20 센서 핸들 생성 중 다른 오류가 발생한 경우
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "device enumeration failed: %s", esp_err_to_name(err));
        goto cleanup;
    }

    // 성공적으로 DS18B20 센서 핸들이 생성된 경우, iterator 정리 및 전역 핸들 설정
    onewire_del_device_iter(iter);
    iter = NULL;

    s_bus = new_bus;
    s_ds18b20 = new_ds18b20;

    ESP_LOGI(TAG, "DS18B20 init success");
    return ESP_OK;

cleanup:
    if (iter != NULL) {
        onewire_del_device_iter(iter);
    }
    sensors_cleanup_handles(&new_bus, &new_ds18b20);
    return err;
}

// sensors_deinit:
// 센서 핸들을 넘겨서 정리하는 함수
esp_err_t sensors_deinit(void)
{
    return sensors_cleanup_handles(&s_bus, &s_ds18b20);
}

// sensors_read_all:
// 모든 센서에서 데이터를 읽어와서 sensor_data_t 구조체에 저장하는 함수
esp_err_t sensors_read_all(sensor_data_t *out_data)
{
    // 매개변수 유효성 검사
    if (out_data == NULL) {
        return ESP_ERR_INVALID_ARG;
    }

    // 출력 구조체 초기화 함수 호출
    sensors_reset_data(out_data);

    // 초기화 여부 확인
    if (s_bus == NULL || s_ds18b20 == NULL) {
        return ESP_ERR_INVALID_STATE;
    }

    // DS18B20 센서에서 온도 읽기
    esp_err_t err = ds18b20_trigger_temperature_conversion_for_all(s_bus);
    if (err != ESP_OK) {
        return err;
    }

    // 실제 온도 값을 읽기
    float temp_c = 0.0f;
    err = ds18b20_get_temperature(s_ds18b20, &temp_c);
    if (err != ESP_OK) {
        return err;
    }

    // 센서 데이터 이상치 검사: 온도가 유한한 숫자인지, DS18B20의 허용 범위 내에 있는지 확인 (전처리로 뺄지)
    if (!isfinite(temp_c) || temp_c < DS18B20_MIN_TEMP_C || temp_c > DS18B20_MAX_TEMP_C) {
        ESP_LOGW(TAG, "discarding implausible DS18B20 reading: %.2f C", temp_c);
        return ESP_ERR_INVALID_RESPONSE;
    }

    // 구조체에 저장
    out_data->hot_surface_temp_c = temp_c;
    out_data->hot_surface_ok = true;

    return ESP_OK;
}
