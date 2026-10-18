#!/bin/bash
pkill -f "vega-virtual-device" 2>/dev/null || true
pkill -f "qemu-system-aarch64" 2>/dev/null || true
sleep 1
find /Users/sagnikdey/vega/sdk/vega-sdk/main/0.24.9914/vvd/instances/bb902bf4-d911-4346-8ccb-8acb40299a9f/ -name "*.lock" -delete 2>/dev/null || true
