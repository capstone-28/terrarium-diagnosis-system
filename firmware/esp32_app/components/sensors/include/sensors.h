#ifndef SENSORS_H
#define SENSORS_H

#include <stdbool.h>
#include "esp_err.h"

typedef struct {
    float hot_surface_temp_c;
    float hot_air_temp_c;
    float cool_air_temp_c;
    int light_level;
    bool hot_surface_ok;
    bool hot_air_ok;
    bool cool_air_ok;
    bool light_ok;
} sensor_data_t;

esp_err_t sensors_init(void);
esp_err_t sensors_deinit(void);
esp_err_t sensors_read_all(sensor_data_t *out_data);

#endif
