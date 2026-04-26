import sounddevice as sd
import numpy as np
import base64
import sys

def callback(indata, frames, time, status):
    if status:
        pass
    int16_data = np.int16(indata * 32767)
    b64 = base64.b64encode(int16_data.tobytes()).decode('utf-8')
    print(b64)
    sys.stdout.flush()

try:
    with sd.InputStream(samplerate=16000, channels=1, dtype='float32', blocksize=4096, callback=callback):
        while True:
            sd.sleep(1000)
except Exception as e:
    print(f"ERROR: {e}", file=sys.stderr)
