import sounddevice as sd
import numpy as np
import sys
import math

def get_best_device():
    devices = sd.query_devices()
    for i, d in enumerate(devices):
        if d['max_input_channels'] > 0:
            name = d['name'].lower()
            if 'microphone' in name or 'realtek' in name:
                return i
    return None

def callback(indata, frames, time, status):
    if status:
        sys.stderr.write(f"STATUS:{status}\n")
        sys.stderr.flush()
    
    boosted = np.clip(indata * 2.0, -1.0, 1.0)
    rms = math.sqrt(np.mean(boosted**2))
    level = int(min(100, rms * 500))
    
    # Write level on stderr (for UI)
    sys.stderr.write(f"LEVEL:{level}\n")
    sys.stderr.flush()
    
    # Write raw PCM16 binary directly to stdout (no base64, no newlines)
    pcm16 = np.int16(boosted * 32767)
    sys.stdout.buffer.write(pcm16.tobytes())
    sys.stdout.buffer.flush()

dev = get_best_device()
sys.stderr.write(f"DEVICE:{dev}\n")
sys.stderr.flush()

try:
    with sd.InputStream(samplerate=16000, channels=1, dtype='float32',
                        blocksize=4096, callback=callback, device=dev):
        while True:
            sd.sleep(1000)
except Exception as e:
    sys.stderr.write(f"ERROR:{e}\n")
    sys.stderr.flush()
    sys.exit(1)
