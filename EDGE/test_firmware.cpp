/**
 * ============================================================================
 * SkyGuard AI - Tier 1: Station Edge Engine
 * Testbench & Timing Profiler for firmware_esp32_core.h
 * File: test_firmware.cpp
 * ============================================================================
 */

#include "firmware_esp32_core.h"
#include <iostream>
#include <cassert>
#include <chrono>
#include <vector>

void test_static_bounds() {
    std::cout << "[TEST] 1. Static Boundaries & ADC Corruption Filter..." << std::endl;
    
    // Normal reading
    SensorRawReading normal = {25.0f, 1013.25f, 60.0f, 1689336000};
    uint8_t flag_norm = edge_check_static_bounds(&normal);
    assert(flag_norm == EDGE_PASS);

    // Temp OOB (high)
    SensorRawReading high_temp = {65.0f, 1013.25f, 60.0f, 1689336000};
    assert(edge_check_static_bounds(&high_temp) == EDGE_ERR_OUT_OF_BOUNDS);

    // Press OOB (low)
    SensorRawReading low_press = {25.0f, 750.0f, 60.0f, 1689336000};
    assert(edge_check_static_bounds(&low_press) == EDGE_ERR_OUT_OF_BOUNDS);

    // ADC Rail disconnect
    SensorRawReading adc_disc = {-999.0f, 1013.25f, 60.0f, 1689336000};
    assert(edge_check_static_bounds(&adc_disc) == EDGE_ERR_OUT_OF_BOUNDS);

    // ADC Corrupt humidity
    SensorRawReading adc_rh = {25.0f, 1013.25f, 110.0f, 1689336000};
    assert(edge_check_static_bounds(&adc_rh) == EDGE_ERR_OUT_OF_BOUNDS);

    // NaN bitflip
    SensorRawReading nan_reading = {NAN, 1013.25f, 60.0f, 1689336000};
    assert(edge_check_static_bounds(&nan_reading) & EDGE_ERR_TELEMETRY_CORRUPT);

    std::cout << "       PASS: Static boundaries and corruption tests succeeded." << std::endl;
}

void test_thermodynamic_invariants() {
    std::cout << "[TEST] 2. Thermodynamic August-Roche-Magnus Invariant Check..." << std::endl;
    
    float td = 0.0f;
    // Standard normal condition: T=30C, RH=60% -> Td should be ~21.4C
    SensorRawReading norm = {30.0f, 1012.0f, 60.0f, 1689336000};
    uint8_t flag_norm = edge_check_thermodynamic_invariants(&norm, &td);
    assert(flag_norm == EDGE_PASS);
    assert(td > 20.0f && td < 23.0f);
    assert(td <= norm.T + SUPERSAT_THRESHOLD_C);

    // Impossible supersaturation: simulate corrupted high RH reading or faulty psychrometric combination
    // E.g. T=42C, RH=95%, P=1015 hPa -> Rule 2 extreme combination without barometric depression
    SensorRawReading extreme_heat_humid = {42.0f, 1015.0f, 95.0f, 1689336000};
    uint8_t flag_extreme = edge_check_thermodynamic_invariants(&extreme_heat_humid, &td);
    assert(flag_extreme & EDGE_ERR_THERMODYNAMIC_IMPOSSIBLE);

    std::cout << "       PASS: Thermodynamic invariant calculation verified (computed Td=" << td << " C)." << std::endl;
}

void test_temporal_ring_buffer() {
    std::cout << "[TEST] 3. Micro-Temporal Ring Buffer Analysis (Step Spike & Deadband)..." << std::endl;

    StaticRingBuffer rb;
    ring_buffer_init(&rb);

    // Populate with 11 normal stable readings: T=25.0, P=1010.0, RH=50.0
    for (int i = 0; i < 11; ++i) {
        SensorRawReading sample = {25.0f + (float)i * 0.05f, 1010.0f, 50.0f, (uint32_t)(1689336000 + i * 300)};
        ring_buffer_push(&rb, &sample);
    }
    assert(rb.count == 11);

    // Test Step Spike
    float t_step = 0, p_step = 0, rh_step = 0;
    SensorRawReading spike_sample = {35.5f, 1010.0f, 50.0f, 1689336000 + 11 * 300}; // +10C jump (>8C)
    uint8_t spike_flag = edge_check_temporal_invariants(&spike_sample, &rb, &t_step, &p_step, &rh_step);
    assert(spike_flag & EDGE_SUSPECT_STEP_SPIKE);
    assert(t_step > 8.0f);

    // Test Flatline / Deadband (Frozen sensor)
    StaticRingBuffer frozen_rb;
    ring_buffer_init(&frozen_rb);
    for (int i = 0; i < EDGE_RING_BUFFER_SIZE; ++i) {
        SensorRawReading frozen_sample = {22.400f, 1012.0f, 55.0f, (uint32_t)(1689336000 + i * 300)};
        ring_buffer_push(&frozen_rb, &frozen_sample);
    }
    SensorRawReading current_frozen = {22.400f, 1012.0f, 55.0f, 1689336000 + 12 * 300};
    uint8_t frozen_flag = edge_check_temporal_invariants(&current_frozen, &frozen_rb, &t_step, &p_step, &rh_step);
    assert(frozen_flag & EDGE_ERR_SENSOR_FROZEN);

    std::cout << "       PASS: Temporal step spikes and sensor frozen deadbands correctly detected." << std::endl;
}

void test_json_payload_and_spool() {
    std::cout << "[TEST] 4. JSON Serialization and Circular Flash Spool..." << std::endl;

    SensorRawReading sample = {32.40f, 1004.20f, 78.50f, 1689336000};
    EdgeAnalysisResult edge = {0, "EDGE_PASS", 28.10f, 0.20f, -0.10f, 1.20f};
    EdgeDiagInfo diag = {3.82f, -74, 0};

    char json_buf[EDGE_MAX_PAYLOAD_SIZE];
    int len = edge_serialize_json_payload("AWS_43003", "2023-07-14T12:00:00Z", &sample, &edge, &diag, json_buf, sizeof(json_buf));
    assert(len > 0);
    assert(strstr(json_buf, "\"sid\":\"AWS_43003\"") != NULL);
    assert(strstr(json_buf, "\"flag\":0") != NULL);
    assert(strstr(json_buf, "\"desc\":\"EDGE_PASS\"") != NULL);

    // Test Circular Spool Storage
    CircularSpoolStorage spool;
    spool_storage_init(&spool);
    assert(spool_storage_get_count(&spool) == 0);

    // Push 70 items (capacity is 64) to verify circular overwrite
    for (int i = 0; i < 70; ++i) {
        char item[64];
        snprintf(item, sizeof(item), "{\"msg_id\":%d}", i);
        spool_storage_push(&spool, item);
    }
    assert(spool_storage_get_count(&spool) == EDGE_MAX_SPOOL_RECORDS);
    assert(spool.total_dropped_overflow == 6);

    // Drain spool (FIFO order should start from msg_id 6)
    char popped[EDGE_MAX_PAYLOAD_SIZE];
    bool pop_ok = spool_storage_pop(&spool, popped, sizeof(popped));
    assert(pop_ok);
    assert(strstr(popped, "{\"msg_id\":6}") != NULL);

    std::cout << "       PASS: JSON serialization and circular flash spool verified." << std::endl;
}

void test_timing_and_profiling() {
    std::cout << "[TEST] 5. Timing Profiling (Simulating 50,000 Observation Cycles)..." << std::endl;

    StaticRingBuffer rb;
    ring_buffer_init(&rb);

    SensorRawReading sample = {28.5f, 1008.2f, 65.4f, 1689336000};

    auto t_start = std::chrono::high_resolution_clock::now();
    const int NUM_CYCLES = 50000;

    for (int i = 0; i < NUM_CYCLES; ++i) {
        sample.T = 28.0f + (float)(i % 100) * 0.05f;
        sample.P = 1008.0f + (float)(i % 50) * 0.02f;
        sample.RH = 65.0f + (float)(i % 80) * 0.1f;
        sample.timestamp_epoch += 300;

        EdgeAnalysisResult res = edge_process_observation(&sample, &rb);
        (void)res;
    }

    auto t_end = std::chrono::high_resolution_clock::now();
    std::chrono::duration<double, std::micro> elapsed_us = t_end - t_start;
    double us_per_sample = elapsed_us.count() / (double)NUM_CYCLES;

    std::cout << "       Total cycles: " << NUM_CYCLES << std::endl;
    std::cout << "       Total time:   " << elapsed_us.count() / 1000.0 << " ms" << std::endl;
    std::cout << "       Time/sample:  " << us_per_sample << " us (" << us_per_sample / 1000.0 << " ms)" << std::endl;
    std::cout << "       Budget limit: 10,000 us (10.0 ms)" << std::endl;
    assert(us_per_sample < 10000.0); // Strict guarantee: << 10 ms budget
    std::cout << "       PASS: Execution time is well within the 10 ms embedded budget!" << std::endl;
}

int main() {
    std::cout << "========================================================" << std::endl;
    std::cout << "SkyGuard AI - Tier 1: Station Edge Engine Test Harness" << std::endl;
    std::cout << "========================================================" << std::endl;

    test_static_bounds();
    test_thermodynamic_invariants();
    test_temporal_ring_buffer();
    test_json_payload_and_spool();
    test_timing_and_profiling();

    std::cout << "========================================================" << std::endl;
    std::cout << "ALL 5 TEST SUITES PASSED SUCCESSFULLY (100% PASS RATE)!" << std::endl;
    std::cout << "========================================================" << std::endl;
    return 0;
}
