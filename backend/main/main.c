#include "driver/i2c_master.h"
#include <stdio.h>
#include "esp_err.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/semphr.h"
#include "esp_lcd_panel_io.h"
#include "esp_lcd_panel_ops.h"
#include "esp_lcd_panel_vendor.h"
#include "esp_lvgl_port.h"
#include "lvgl.h"
#include "esp_wifi.h"
#include "esp_event.h"
#include "nvs_flash.h"
#include "esp_http_server.h"
#include <string.h>

static const char *TAG = "TPMS";

// ================================================
// CONFIGURAÇÕES
// ================================================
#define PRESSURE_LOW_PSI     26.0f
#define PRESSURE_HIGH_PSI    41.0f
#define AVERAGE_SAMPLES     10

// WiFi
#define WIFI_SSID      "SEU_WIFI_AQUI"
#define WIFI_PASSWORD  "SUA_SENHA_AQUI"

// I2C Display
#define I2C_DISPLAY_BUS_PORT    0
#define I2C_DISPLAY_SDA         (gpio_num_t)5
#define I2C_DISPLAY_SCL         (gpio_num_t)4

// I2C Sensor
#define I2C_SENSOR_BUS_PORT  1
#define I2C_SENSOR_SDA       (gpio_num_t)33
#define I2C_SENSOR_SCL       (gpio_num_t)32

// Display
#define LCD_H_RES  128
#define LCD_V_RES   64

// ================================================
// VARIÁVEIS GLOBAIS - I2C
// ================================================
i2c_master_bus_handle_t i2c_display_bus = NULL;
i2c_master_bus_config_t display_bus_config = {};
esp_lcd_panel_io_handle_t io_handle = NULL;
esp_lcd_panel_io_i2c_config_t io_config = {};

i2c_master_bus_handle_t i2c_sensor_bus = NULL;
i2c_master_bus_config_t sensor_bus_config = {};
i2c_master_dev_handle_t i2c_smp3011_handle = NULL;
i2c_device_config_t i2c_smp3011_config = {};

// ================================================
// VARIÁVEIS GLOBAIS - Display LVGL
// ================================================
lv_obj_t *lblPneu;
lv_obj_t *lblPressure;
lv_obj_t *lblTemperature;
lv_obj_t *lblStatus;

// ================================================
// VARIÁVEIS GLOBAIS - Sensor e Dados
// ================================================
float pressure    = 0.0f;
float temperature = 0.0f;

float pressureBuf[AVERAGE_SAMPLES] = {0};
int   bufIndex  = 0;
bool  bufFull   = false;

// Mutex para proteger dados compartilhados
SemaphoreHandle_t sensor_mutex = NULL;

// ================================================
// VARIÁVEIS GLOBAIS - WiFi e HTTP
// ================================================
httpd_handle_t server = NULL;
bool wifi_connected = false;

// ================================================
// DECLARAÇÕES DE FUNÇÕES
// ================================================
void        displayInit();
void        smp3011Init();
bool        smp3011Poll();
float       calcAverage(float *buf, int size);
const char* getStatus(float pressure_psi);
void        wifi_event_handler(void *arg, esp_event_base_t event_base, int32_t event_id, void *event_data);
void        wifi_init();
void        http_server_start();
esp_err_t   api_sensores_handler(httpd_req_t *req);

// ================================================
// FUNÇÕES UTILITÁRIAS
// ================================================
float calcAverage(float *buf, int size)
{
    float sum = 0.0f;
    for (int i = 0; i < size; i++) sum += buf[i];
    return sum / (float)size;
}

const char* getStatus(float p)
{
    if (p < PRESSURE_LOW_PSI)  return "! PRESSAO BAIXA";
    if (p > PRESSURE_HIGH_PSI) return "! PRESSAO ALTA";
    return "STATUS: OK";
}

// ================================================
// WiFi
// ================================================
void wifi_event_handler(void *arg, esp_event_base_t event_base,
                        int32_t event_id, void *event_data)
{
    if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_START) {
        ESP_LOGI(TAG, "[WiFi] Conectando...");
        esp_wifi_connect();
    } 
    else if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_DISCONNECTED) {
        ESP_LOGI(TAG, "[WiFi] Desconectado, reconectando...");
        wifi_connected = false;
        esp_wifi_connect();
    } 
    else if (event_base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP) {
        ip_event_got_ip_t *event = (ip_event_got_ip_t *)event_data;
        ESP_LOGI(TAG, "[WiFi] Conectado! IP: " IPSTR, IP2STR(&event->ip_info.ip));
        wifi_connected = true;
    }
}

void wifi_init()
{
    ESP_LOGI(TAG, "[WiFi] Inicializando...");
    
    ESP_ERROR_CHECK(nvs_flash_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());

    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&cfg));

    ESP_ERROR_CHECK(esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID, 
                                               &wifi_event_handler, NULL));
    ESP_ERROR_CHECK(esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP, 
                                               &wifi_event_handler, NULL));

    wifi_config_t wifi_config = {
        .sta = {
            .ssid = WIFI_SSID,
            .password = WIFI_PASSWORD,
        },
    };

    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_config));
    ESP_ERROR_CHECK(esp_wifi_start());
}

// ================================================
// HTTP Server
// ================================================
esp_err_t api_sensores_handler(httpd_req_t *req)
{
    char response[512];
    
    // Protege acesso aos dados do sensor
    if (xSemaphoreTake(sensor_mutex, pdMS_TO_TICKS(100))) {
        // Monta JSON manualmente (sem cJSON)
        snprintf(response, sizeof(response),
            "["
            "{\"id\":1,\"pressao\":%.1f,\"temperatura\":%.0f},"
            "{\"id\":2,\"pressao\":0.0,\"temperatura\":0.0},"
            "{\"id\":3,\"pressao\":0.0,\"temperatura\":0.0},"
            "{\"id\":4,\"pressao\":0.0,\"temperatura\":0.0}"
            "]",
            pressure, temperature);
        
        xSemaphoreGive(sensor_mutex);
    } else {
        // Se não conseguiu o mutex, retorna erro
        snprintf(response, sizeof(response), "[]");
    }

    httpd_resp_set_type(req, "application/json");
    httpd_resp_send(req, response, strlen(response));

    return ESP_OK;
}

void http_server_start()
{
    httpd_config_t config = HTTPD_DEFAULT_CONFIG();
    config.server_port = 80;
    config.max_open_sockets = 8;

    if (httpd_start(&server, &config) == ESP_OK) {
        httpd_uri_t api_sensores = {
            .uri = "/api/sensores",
            .method = HTTP_GET,
            .handler = api_sensores_handler,
            .user_ctx = NULL
        };
        httpd_register_uri_handler(server, &api_sensores);
        ESP_LOGI(TAG, "[HTTP] Servidor iniciado na porta 80");
        ESP_LOGI(TAG, "[HTTP] Endpoint: GET /api/sensores");
    } else {
        ESP_LOGE(TAG, "[HTTP] Erro ao iniciar servidor");
    }
}

// ================================================
// MAIN
// ================================================
void app_main()
{
    ESP_LOGI(TAG, "========== TPMS START ==========");
    ESP_LOGI(TAG, "Inicializando barramentos I2C");
    
    // Configuração I2C Display
    display_bus_config.clk_source = I2C_CLK_SRC_DEFAULT;
    display_bus_config.glitch_ignore_cnt = 7;
    display_bus_config.i2c_port = I2C_DISPLAY_BUS_PORT;
    display_bus_config.sda_io_num = I2C_DISPLAY_SDA;
    display_bus_config.scl_io_num = I2C_DISPLAY_SCL;
    display_bus_config.flags.enable_internal_pullup = true;
    
    // Configuração I2C Sensor
    sensor_bus_config.clk_source = I2C_CLK_SRC_DEFAULT;
    sensor_bus_config.glitch_ignore_cnt = 7;
    sensor_bus_config.i2c_port = I2C_SENSOR_BUS_PORT;
    sensor_bus_config.sda_io_num = I2C_SENSOR_SDA;
    sensor_bus_config.scl_io_num = I2C_SENSOR_SCL;
    sensor_bus_config.flags.enable_internal_pullup = true;
    
    // Configuração Sensor SMP3011
    i2c_smp3011_config.dev_addr_length = I2C_ADDR_BIT_LEN_7;
    i2c_smp3011_config.device_address = 0x78;
    i2c_smp3011_config.scl_speed_hz = 400000;
    i2c_smp3011_config.scl_wait_us = 1000000;
    i2c_smp3011_config.flags.disable_ack_check = 0;

    // Cria barramentos I2C
    ESP_ERROR_CHECK(i2c_new_master_bus(&sensor_bus_config,  &i2c_sensor_bus));
    ESP_ERROR_CHECK(i2c_new_master_bus(&display_bus_config, &i2c_display_bus));

    // Inicializa sensor e display
    smp3011Init();
    displayInit();

    // Cria mutex para proteger dados do sensor
    sensor_mutex = xSemaphoreCreateMutex();

    // Inicializa WiFi e HTTP Server
    wifi_init();
    
    // Espera WiFi conectar
    ESP_LOGI(TAG, "Aguardando conexão WiFi...");
    for (int i = 0; i < 30 && !wifi_connected; i++) {
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
    
    // Inicia HTTP server
    if (wifi_connected) {
        http_server_start();
    }

    // Setup LVGL UI
    lvgl_port_lock(portMAX_DELAY);
    lv_obj_t *scr = lv_disp_get_scr_act(NULL);

    lblPneu = lv_label_create(scr);
    lv_label_set_text(lblPneu, "--- PNEU 1 ---");
    lv_obj_set_width(lblPneu, LCD_H_RES);
    lv_label_set_long_mode(lblPneu, LV_LABEL_LONG_CLIP);
    lv_obj_align(lblPneu, LV_ALIGN_TOP_MID, 0, 0);

    lblPressure = lv_label_create(scr);
    lv_label_set_text(lblPressure, "P: ---.- PSI");
    lv_obj_set_width(lblPressure, LCD_H_RES);
    lv_label_set_long_mode(lblPressure, LV_LABEL_LONG_CLIP);
    lv_obj_align(lblPressure, LV_ALIGN_TOP_MID, 0, 16);

    lblTemperature = lv_label_create(scr);
    lv_label_set_text(lblTemperature, "T: --- oC");
    lv_obj_set_width(lblTemperature, LCD_H_RES);
    lv_label_set_long_mode(lblTemperature, LV_LABEL_LONG_CLIP);
    lv_obj_align(lblTemperature, LV_ALIGN_TOP_MID, 0, 32);

    lblStatus = lv_label_create(scr);
    lv_label_set_text(lblStatus, "STATUS: ---");
    lv_obj_set_width(lblStatus, LCD_H_RES);
    lv_label_set_long_mode(lblStatus, LV_LABEL_LONG_CLIP);
    lv_obj_align(lblStatus, LV_ALIGN_TOP_MID, 0, 48);

    lvgl_port_unlock();

    ESP_LOGI(TAG, "========== TPMS READY ==========");

    // Loop principal
    while (1)
    {
        bool ok = smp3011Poll();

        if (ok)
        {
            pressureBuf[bufIndex] = pressure;
            bufIndex = (bufIndex + 1) % AVERAGE_SAMPLES;
            if (bufIndex == 0) bufFull = true;

            int validSamples = bufFull ? AVERAGE_SAMPLES : bufIndex;
            float avgPressure = calcAverage(pressureBuf, validSamples);

            const char *status = getStatus(avgPressure);

            // Protege escrita nos dados (usado pelo HTTP handler)
            if (xSemaphoreTake(sensor_mutex, pdMS_TO_TICKS(10))) {
                pressure = avgPressure;
                xSemaphoreGive(sensor_mutex);
            }

            lvgl_port_lock(portMAX_DELAY);
            lv_label_set_text_fmt(lblPressure,    "P: %5.1f PSI", avgPressure);
            lv_label_set_text_fmt(lblTemperature, "T: %3.0f oC",  temperature);
            lv_label_set_text(    lblStatus,       status);
            lvgl_port_unlock();

            ESP_LOGI(TAG, "P(avg): %.1f PSI | T: %.0f oC | %s",
                     avgPressure, temperature, status);
        }

        vTaskDelay(pdMS_TO_TICKS(100));
    }
}

// ================================================
// SMP3011
// ================================================
void smp3011Init()
{
    i2c_master_bus_add_device(i2c_sensor_bus, &i2c_smp3011_config, &i2c_smp3011_handle);

    uint8_t cmd = 0xAC;
    i2c_master_transmit(i2c_smp3011_handle, &cmd, 1, 20);

    ESP_LOGI(TAG, "SMP3011 inicializado");
}

bool smp3011Poll()
{
    uint8_t buf[6];
    esp_err_t ret = i2c_master_receive(i2c_smp3011_handle, buf, sizeof(buf), 20);
    if (ret != ESP_OK) return false;

    if ((buf[0] & 0x20) != 0) return false;

    uint8_t cmd = 0xAC;
    i2c_master_transmit(i2c_smp3011_handle, &cmd, 1, 20);

    uint32_t rawP = ((uint32_t)buf[1] << 16) | ((uint32_t)buf[2] << 8) | buf[3];
    float pct = (float)rawP / 16777215.0f;
    pct = (pct - 0.15f) / 0.7f;
    pressure = (pct * 500000.0f) / 6894.76f;  // Pa -> PSI

    uint32_t rawT = ((uint32_t)buf[4] << 8) | buf[5];
    temperature = (190.0f * ((float)rawT / 65535.0f)) - 40.0f;

    return true;
}

// ================================================
// Display
// ================================================
void displayInit()
{
    ESP_LOGI(TAG, "Inicializando SSD1306");
    
    io_config.dev_addr = 0x3C;
    io_config.scl_speed_hz = 400000;
    io_config.control_phase_bytes = 1;
    io_config.lcd_cmd_bits = 8;
    io_config.lcd_param_bits = 8;
    io_config.dc_bit_offset = 6;
    
    ESP_ERROR_CHECK(esp_lcd_new_panel_io_i2c(i2c_display_bus, &io_config, &io_handle));

    esp_lcd_panel_handle_t panel_handle = NULL;
    esp_lcd_panel_dev_config_t panel_config = {};
    panel_config.bits_per_pixel = 1;
    panel_config.reset_gpio_num = (gpio_num_t)-1;
    
    esp_lcd_panel_ssd1306_config_t ssd1306_config = {};
    ssd1306_config.height = LCD_V_RES;
    panel_config.vendor_config = &ssd1306_config;

    ESP_ERROR_CHECK(esp_lcd_new_panel_ssd1306(io_handle, &panel_config, &panel_handle));
    ESP_ERROR_CHECK(esp_lcd_panel_reset(panel_handle));
    ESP_ERROR_CHECK(esp_lcd_panel_init(panel_handle));
    ESP_ERROR_CHECK(esp_lcd_panel_disp_on_off(panel_handle, true));

    const lvgl_port_cfg_t lvgl_cfg = ESP_LVGL_PORT_INIT_CONFIG();
    lvgl_port_init(&lvgl_cfg);

    lvgl_port_display_cfg_t disp_cfg = {};
    disp_cfg.io_handle = io_handle;
    disp_cfg.panel_handle = panel_handle;
    disp_cfg.buffer_size = LCD_H_RES * LCD_V_RES;
    disp_cfg.double_buffer = true;
    disp_cfg.hres = LCD_H_RES;
    disp_cfg.vres = LCD_V_RES;
    disp_cfg.monochrome = true;
    disp_cfg.rotation.swap_xy = false;
    disp_cfg.rotation.mirror_x = false;
    disp_cfg.rotation.mirror_y = false;
    
    lv_disp_t *disp = lvgl_port_add_disp(&disp_cfg);
    lv_disp_set_rotation(disp, LV_DISP_ROT_NONE);

    ESP_LOGI(TAG, "Display OK");
}