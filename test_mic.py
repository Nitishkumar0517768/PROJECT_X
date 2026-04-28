import sounddevice as sd
import numpy as np
import base64
import sys
import math

# Explicitly use device index 1 = "Microphone (2- Realtek(R) Audio)"
DEVICE_INDEX = 1

def callback(indata, frames, time, status):
    if status:
        print(f"STATUS: {status}", file=sys.stderr)

    rms = math.sqrt(np.mean(indata**2))
    level = int(min(100, rms * 500))
    print(f"LEVEL:{level}")

    int16_data = np.int16(indata * 32767)
    b64 = base64.b64encode(int16_data.tobytes()).decode('utf-8')
    print(b64)
    sys.stdout.flush()

print("MIC_STARTED", flush=True)
try:
    with sd.InputStream(samplerate=16000, channels=1, dtype='float32',
                        blocksize=4096, callback=callback, device=DEVICE_INDEX):
        while True:
            sd.sleep(1000)
except Exception as e:
    print(f"ERROR: {e}", file=sys.stderr)
    sys.exit(1)
