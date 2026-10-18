#!/bin/bash
set -e
find /Users/sagnikdey/vega/sdk/vega-sdk/main/0.24.9914/vvd/instances/bb902bf4-d911-4346-8ccb-8acb40299a9f/ -name "*.lock" -delete 2>/dev/null || true
export DYLD_LIBRARY_PATH=/Users/sagnikdey/vega/sdk/vega-sdk/main/0.24.9914/vvd/images/tv/vmtools/agent/lib64:/Users/sagnikdey/vega/sdk/vega-sdk/main/0.24.9914/vvd/images/tv/vmtools/agent/lib64/qt/lib
exec /Users/sagnikdey/vega/sdk/vega-sdk/main/0.24.9914/vvd/images/tv/vmtools/agent/qemu/darwin-aarch64/vega-virtual-device \
  -avd-arch arm64 \
  -skindir /Users/sagnikdey/vega/sdk/vega-sdk/main/0.24.9914/vvd/images/tv/vmtools/agent/skins \
  -skin tv \
  -ports 5554,5555 \
  -dns-server auto \
  -sysdir /Users/sagnikdey/vega/sdk/vega-sdk/main/0.24.9914/vvd/instances/bb902bf4-d911-4346-8ccb-8acb40299a9f \
  -datadir /Users/sagnikdey/vega/sdk/vega-sdk/main/0.24.9914/vvd/instances/bb902bf4-d911-4346-8ccb-8acb40299a9f \
  -data /Users/sagnikdey/vega/sdk/vega-sdk/main/0.24.9914/vvd/instances/bb902bf4-d911-4346-8ccb-8acb40299a9f/userdata.qcow2 \
  -keyboard-mapping KEY_ESC:KEY_BACK,KEY_F1:KEY_HOMEPAGE,KEY_F2:KEY_MENU,KEY_F3:KEY_REWIND,KEY_F4:KEY_PLAYPAUSE,KEY_F5:KEY_FASTFORWARD \
  -qemu -qmp unix:/tmp/qmp-socket-5554.sock,server,nowait
